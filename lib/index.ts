import { BehaviorSubject, combineLatest, isObservable, merge, Observable, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, scan, takeUntil } from 'rxjs/operators';

export interface Action<T> { type: string, value: T }

export type ActionStream = Observable<Action<any>>;

export type ActionReducer<T> = (state: T, action: Action<any>) => T;

export type StreamToState<T> = (action$: ActionStream) => Observable<T>;

export interface Actor<T> {
  type: string,
  new: (value: T) => Action<T>,
}

export interface Store<T> {
  action$: Observable<Action<any>>;
  state$: Observable<T>,
  getState(): T,
  dispatch(action: Action<any>): void,
  destruct(): void,
}

export const jsonEqual = <T>(aa: T, bb: T) => JSON.stringify(aa) === JSON.stringify(bb);
export const forceBool = (val: boolean) => !!val;
export const forceNum = (val: number) => +val;
export const or_ = <T>(orValue: T) => (val: T) => val || orValue;
export const orArray = <T>(val: T[]) => val || [];
export const orNull = <T>(val: T) => val || null;
export const orObject = <T extends object>(val: T) => val || <T>{};
export const orZero = (val: number) => val || 0;

export const setPropertyIfNotSame = <T extends object, K extends keyof T>(state: T, key: K, value: T[K]): T =>
  !state || state[key] === value ? state : Object.assign({}, state, { [key]: value });
export const redSetPropertyIfNotSame_ = <T extends object, K extends keyof T>(key: K) =>
  (state: T, value: T[K]) => setPropertyIfNotSame(state, key, value);

export const setPropertyIfNotEqual = <T extends object, K extends keyof T>(state: T, key: K, value: T[K]): T =>
  !state || state[key] === value || jsonEqual(state[key], value) ? state : Object.assign({}, state, { [key]: value });
export const redSetPropertyIfNotEqual_ = <T extends object, K extends keyof T>(key: K) =>
  (state: T, value: T[K]) => setPropertyIfNotEqual(state, key, value);

export const redSet = <T extends object>(state: T, value: T) => value;
export const redMerge = <T extends { [key: string]: any }>(state: T, value: T): T => {
  state = state || <T>{};
  value = value || <T>{};
  const ret = typeof state === 'object' && typeof value === 'object' && Object.entries(value).every(([key, val]) => state[key] === val) ? state
    : Object.assign({} as T, state || {}, value || {});
  return ret;
}

export const redMergeProperty_ = <T extends object, K extends keyof T>(key: K) => (state: T, value: T[K]): T => {
  state = state || <T>{};
  const nested = state[key] as any as object;
  const merged = redMerge(nested, value as any as object);
  const ret = nested === merged ? state : Object.assign({}, state, { [key]: merged });
  return ret;
}

export const reducers_ = <T>(actionTypeToHandler: { [key: string]: (_state: T, _value: any) => T }): ActionReducer<T> =>
  (state, action) => action.type in actionTypeToHandler ? actionTypeToHandler[action.type](state, action.value) : state;

export const actor = <T>(...type: string[]) => {
  const _type = (type || ['???']).join('_');
  return <Actor<T>>{ type: _type, new: (value: T) => <Action<T>>{ type: _type, value } };
}

export const assemble$ = <T extends object>(base: T | Observable<T>, parts?: { [K in keyof T]: (Observable<T[K]> | T[K]) }) => {
  const base$ = isObservable(base) ? base : of(typeof base === 'object' ? base : <T>{});
  const part$s = Object
    .entries(parts || {})
    .filter(([key]) => typeof key === 'string')
    .map(([key, value]) => (isObservable(value) ? value : of(value)).pipe(map(_ => <T>{ [key]: _ })));
  const parts$ = merge(...part$s).pipe(scan((acc, val) => Object.assign(<T>{}, acc || <T>{}, val || <T>{}), <T>{}));
  return combineLatest(base$, parts$).pipe(map(([into, from]) => Object.assign(<T>{}, into, from)));
}

export const assemble$_ = <T extends { [key: string]: any }>(base: T | StreamToState<T>, parts?: { [K in keyof T]: (T[K] | StreamToState<T[K]>) }) =>
  (action$: ActionStream) => {
    const _base = typeof base === 'function' ? (base as StreamToState<T>)(action$) : base;
    const _parts = <{ [K in keyof T]: (Observable<T[K]> | T[K]) }>{};
    Object
      .entries(parts || {})
      .forEach(([key, value]) => _parts[key] = typeof value === 'function' ? (value as StreamToState<T>)(action$) : value);
    return assemble$(_base, _parts);
  }

export const toState$ = <T>(action$: ActionStream, init: T, reduce: ActionReducer<T>) =>
  merge(of(init), action$.pipe(scan(reduce, init)))
    .pipe(distinctUntilChanged());

export const toState$_ = <T>(init: T, reduce: ActionReducer<T>) => (action$: ActionStream) => toState$(action$, init, reduce);

class StoreImpl<T> implements Store<T> {
  action$ = <Observable<Action<any>>>null;
  state$ = <Observable<T>>null;
  private _action$ = <Subject<Action<any>>>null;
  private _state = <T>null;

  constructor(createState: StreamToState<T>) {
    this._action$ = new Subject<Action<any>>();
    this.action$ = this._action$.pipe(map(_ => <Action<any>>{ ..._ }));
    this.state$ = createState(this._action$);
    this.state$.subscribe(state => this._state = state);
  }

  getState() {
    return this._state;
  }

  dispatch(action: Action<any>) {
    this._action$.next(action);
  }

  destruct() {
    this._action$.complete();
  }
}

export const createStore = <T>(createState: StreamToState<T>) => new StoreImpl(createState);

type RxGetter<S, T> = (state: S) => T;

interface RxWatcher<S, T> {
  blocker: Array<Subject<any>>;
  getter: RxGetter<S, T>;
  notify: BehaviorSubject<T>;
}

export class RxState<S> {
  protected readonly DEBOUNCE_CHECK_WATCHERS_MS = 100;
  protected readonly watchers = <Array<RxWatcher<S, any>>>[];
  private readonly _done$ = new Subject();
  private readonly _state$ = <BehaviorSubject<S>>null;
  private readonly _triggerCheckWatchers$ = new Subject();
  private _blockers = <Array<Subject<any>>>[];

  constructor(protected readonly store: Store<S>) {
    this._triggerCheckWatchers$.pipe(debounceTime(this.DEBOUNCE_CHECK_WATCHERS_MS), takeUntil(this._done$)).subscribe(this.checkWatchers);
    this._state$ = new BehaviorSubject(store.getState());
    store.state$.pipe(takeUntil(this._done$)).subscribe(_ => this._state$.next(_));
    this._state$.subscribe(() => {
      this.watchers.forEach(ii => {
        const val = this.applyGetter(ii.getter);
        const isObject = typeof val === 'object' && typeof ii.notify.value === 'object';
        if (isObject && !jsonEqual(val, ii.notify.value) || !isObject && val !== ii.notify.value) {
          ii.notify.next(val);
        }
      });
      this._triggerCheckWatchers$.next();
    });
  }

  get state() { return this._state$.value; }

  destroy() {
    this._state$.complete();
    this._done$.next();
    [this._done$, this._triggerCheckWatchers$, ...this.watchers.map(ii => ii.notify)].forEach(ii => ii.complete());
    this.store.destruct();
  }

  dbgGetCheckWatchersMs = () => this.DEBOUNCE_CHECK_WATCHERS_MS;
  dbgGetStore = () => this.store;
  dbgGetWatchers = () => this.watchers.length;

  act = <T>(act: Actor<T>, value: T, transform?: (val: T) => T) => this.store.dispatch(act.new(transform ? transform(value) : value));
  act_ = <T>(act: Actor<T>, transform?: (val: T) => T) => (value: T) => this.act(act, value, transform);

  watch = <T>(getter: RxGetter<S, T>, until?: Subject<any>) => {
    let watcher = this.watchers.find(ii => ii.getter === getter || ii.getter.toString() === getter.toString());
    if (!watcher) {
      watcher = { getter, notify: new BehaviorSubject(this.applyGetter(getter)), blocker: [] };
      this.watchers.push(watcher);
    }
    if (until && !until.isStopped && !watcher.blocker.includes(until)) {
      watcher.blocker = [...watcher.blocker, until];
      if (!this._blockers.includes(until)) {
        this._blockers = [...this._blockers, until];
        until
          .pipe(takeUntil(until), takeUntil(this._done$))
          .subscribe(null, null, () => {
            this._blockers = this._blockers.filter(_ => _ !== until);
            this._triggerCheckWatchers$.next();
          });
      }
    }
    return watcher.notify as BehaviorSubject<T>;
  }

  private checkWatchers = () => {
    for (let ii = this.watchers.length - 1; ii >= 0; --ii) {
      this.watchers[ii].blocker = this.watchers[ii].blocker.filter(_ => !_.isStopped && this._blockers.includes(_));
      if (!this.watchers[ii].notify.observers.length && !this.watchers[ii].blocker.length) {
        [...this.watchers.splice(ii, 1).map(ww => ww.notify)].forEach(jj => jj.complete());
      }
    }
  }

  private applyGetter = <T>(getter: RxGetter<S, T>) => {
    let ret: T = null;
    try {
      ret = getter(this.state);
    } catch {
      // ignore
    }
    return ret;
  }
}
