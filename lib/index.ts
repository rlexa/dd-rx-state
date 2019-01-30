import { BehaviorSubject, combineLatest, isObservable, merge, Observable, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, scan, takeUntil } from 'rxjs/operators';

export interface Action<T> {
  /** Make sure that the type is globally unique. */
  type: string,
  value: T,
}

export type ActionStream = Observable<Action<any>>;

export type ActionReducer<T> = (state: T, action: Action<any>) => T;

export type StreamToState<T> = (action$: ActionStream) => Observable<T>;

/** Wrapper for creating `Action<T>`s. */
export interface Actor<T> {
  type: string,
  new: (value: T) => Action<T>,
}

/** Similar to Redux store. */
export interface Store<T> {
  action$: ActionStream,
  state$: Observable<T>,
  getState(): T,
  dispatch(action: Action<any>): void,
  destruct(): void,
}

/** Helper: testing content equality. */
export const jsonEqual = <T>(aa: T, bb: T) => JSON.stringify(aa) === JSON.stringify(bb);
/** Helper: to use in place of `val => !!val`. */
export const forceBool = (val: boolean) => !!val;
/** Helper: to use in place of `val => +val`. */
export const forceNum = (val: number) => +val;
/** Helper: to use in place of `val => val || orValue`. */
export const or_ = <T>(orValue: T) => (val: T) => val || orValue;
/** Helper: to use in place of `val => val || []`. */
export const orArray = <T>(val: T[]) => val || [];
/** Helper: to use in place of `val => val || null`. */
export const orNull = <T>(val: T) => val || null;
/** Helper: to use in place of `val => val || {}`. */
export const orObject = <T extends object>(val: T) => val || <T>{};
/** Helper: to use in place of `val => val || 0`. */
export const orZero = (val: number) => val || 0;

/** Sets `state[key] = value` if not identical and returns as new state. */
export const setPropertyIfNotSame = <T extends object, K extends keyof T>(state: T, key: K, value: T[K]): T =>
  !state || state[key] === value ? state : Object.assign({}, state, { [key]: value });
/** Returns a reducer based on `setPropertyIfNotSame`. */
export const redSetPropertyIfNotSame_ = <T extends object, K extends keyof T>(key: K) =>
  (state: T, value: T[K]) => setPropertyIfNotSame(state, key, value);

/** Sets `state[key] = value` if not content-equal and returns as new state. */
export const setPropertyIfNotEqual = <T extends object, K extends keyof T>(state: T, key: K, value: T[K]): T =>
  !state || state[key] === value || jsonEqual(state[key], value) ? state : Object.assign({}, state, { [key]: value });
/** Returns a reducer based on `setPropertyIfNotEqual`. */
export const redSetPropertyIfNotEqual_ = <T extends object, K extends keyof T>(key: K) =>
  (state: T, value: T[K]) => setPropertyIfNotEqual(state, key, value);

/** Reducer for setting `value` as new state. */
export const redSet = <T extends object>(state: T, value: T) => value;
/** Reducer for merging `value` into `state` as new state. */
export const redMerge = <T extends { [key: string]: any }>(state: T, value: T): T => {
  state = state || <T>{};
  value = value || <T>{};
  const ret = typeof state === 'object' && typeof value === 'object' && Object.entries(value).every(([key, val]) => state[key] === val) ? state
    : Object.assign({} as T, state || {}, value || {});
  return ret;
}

/** Returns a reducer which merges the `value` into the `state[key]` as new state. */
export const redMergeProperty_ = <T extends object, K extends keyof T>(key: K) => (state: T, value: T[K]): T => {
  state = state || <T>{};
  const nested = state[key] as any as object;
  const merged = redMerge(nested, value as any as object);
  const ret = nested === merged ? state : Object.assign({}, state, { [key]: merged });
  return ret;
}

/**
 * Returns a reducer built from a map of `Action` handlers.
 * @example
 * interface Test { a?: number, b?: string, c?: boolean };
 * ...
 * const red_test = reducers_<Test>({
 *   'IncrementValueIntoA': (state, val: number) => ({ ...state, a: val + 1 }),
 *   [act_set_b.type]: redSet,
 *   [act_set_c.type]: redSetPropertyIfNotSame_('c'),
 * });
 */
export const reducers_ = <T>(actionTypeToHandler: { [key: string]: (_state: T, _value: any) => T }): ActionReducer<T> =>
  (state, action) => action.type in actionTypeToHandler ? actionTypeToHandler[action.type](state, action.value) : state;

/**
 * Creates an `Actor` with type concatenated from the `type: string[]` parameter.
 * @example
 * const STATE = 'ui';
 * const STATE_GLOBAL = 'global';
 * const set_locale = actor<string>('SET', STATE, STATE_GLOBAL, 'locale');
 * ...
 * const act_set_locale = rxState.act_(set_locale);
 * ...
 * act_set_locale('en_US');
 */
export const actor = <T>(...type: string[]) => {
  const _type = (type || ['???']).join('_');
  return <Actor<T>>{ type: _type, new: (value: T) => <Action<T>>{ type: _type, value } };
}

/**
 * Creates a state Observable emitting new state from scanning the `action$` stream.
 * @example
 * interface Test { a?: number, b?: string, c?: boolean };
 * const action$ = new Subject<Action<any>>();
 * const state$ = toState$(action$, <Test>{ a: 0, b: '', c: false }, reducers_({ 'ActMerge': redMerge }));
 */
export const toState$ = <T>(action$: ActionStream, init: T, reduce: ActionReducer<T>) =>
  merge(of(init), action$.pipe(scan(reduce, init)))
    .pipe(distinctUntilChanged());

/**
 * Returns a creator for a state Observable emitting new state from scanning the `action$` stream.
 * @example
 * interface Test { a?: number, b?: string, c?: boolean };
 * const state$_ = toState$_(<Test>{ a: 0, b: '', c: false }, reducers_({ 'ActMerge': redMerge }));
 * ...
 * const state$ = state$_(action$);
 */
export const toState$_ = <T>(init: T, reduce: ActionReducer<T>) => (action$: ActionStream) => toState$(action$, init, reduce);

/**
 * Assembles a state Observable emitting new state from combining a `base` object or Observable and `parts` values or Observables which relate to the `base` keys.
 * *WARNING: a nested state from `parts` should not be reduced in the `base` if the `base` is an Observable.*
 * @example
 * interface TestNested { a?: number, b?: string, c?: boolean };
 * interface Test { a?: TestNested, b?: string };
 * const action$ = new Subject<Action<any>>();
 * const state_nested$ = toState$(action$, <TestNested>{ a: 0, b: 'nested', c: false }, reducers_({ 'ActMerge': redMerge }));
 * const state_parent$ = toState$(action$, <Test>{ a: null, b: 'parent' }, reducers_({ 'ActSetB': redSetPropertyIfNotSame_('b') }));
 * const state$ = assemble$(state_parent$, { 'a': state_nested$ });
 */
export const assemble$ = <T extends object>(base: T | Observable<T>, parts?: { [K in keyof T]: (Observable<T[K]> | T[K]) }) => {
  const base$ = isObservable(base) ? base : of(typeof base === 'object' ? base : <T>{});
  const part$s = Object
    .entries(parts || {})
    .filter(([key]) => typeof key === 'string')
    .map(([key, value]) => (isObservable(value) ? value : of(value)).pipe(map(_ => <T>{ [key]: _ })));
  const parts$ = merge(...part$s).pipe(scan((acc, val) => Object.assign(<T>{}, acc || <T>{}, val || <T>{}), <T>{}));
  return combineLatest(base$, parts$).pipe(map(([into, from]) => Object.assign(<T>{}, into, from)));
}

/**
 * Returns a creator for assembling a state Observable emitting new state from combining a `base` object or Observable and `parts` values or Observables which relate to the `base` keys.
 * *WARNING: a nested state from `parts` should not be reduced in the `base` if the `base` is an Observable.*
 * @example
 * interface TestNested { a?: number, b?: string, c?: boolean };
 * interface Test { a?: TestNested, b?: string };
 * const state_nested$_ = toState$_(<TestNested>{ a: 0, b: 'nested', c: false }, reducers_({ 'ActMerge': redMerge }));
 * const state_parent$_ = toState$_(<Test>{ a: null, b: 'parent' }, reducers_({ 'ActSetB': redSetPropertyIfNotSame_('b') }));
 * const state$_ = assemble$_(state_parent$_, { 'a': state_nested$_ });
 * ...
 * const state$ = state$_(action$);
 */
export const assemble$_ = <T extends { [key: string]: any }>(base: T | StreamToState<T>, parts?: { [K in keyof T]: (T[K] | StreamToState<T[K]>) }) =>
  (action$: ActionStream) => {
    const _base = typeof base === 'function' ? (base as StreamToState<T>)(action$) : base;
    const _parts = <{ [K in keyof T]: (Observable<T[K]> | T[K]) }>{};
    Object
      .entries(parts || {})
      .forEach(([key, value]) => _parts[key] = typeof value === 'function' ? (value as StreamToState<T>)(action$) : value);
    return assemble$(_base, _parts);
  }

class StoreImpl<T> implements Store<T> {
  action$ = <ActionStream>null;
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

/**
 * `Store` factory.
 * @example
 * const state$_ = assemble$_(...);
 * ...
 * const store = createStore(state$_);
 */
export const createStore = <T>(createState: StreamToState<T>) => new StoreImpl(createState);

type RxGetter<S, T> = (state: S) => T;

interface RxWatcher<S, T> {
  blocker: Array<Subject<any>>;
  getter: RxGetter<S, T>;
  notify: BehaviorSubject<T>;
}

/**
 * Helper class for wrapping the `Store` by watching and setting the state.
 * @example
 * const set_locale = actor<string>('SET', STATE, STATE_GLOBAL, 'locale');
 * ...
 * const state$_ = assemble$_(...);
 * ...
 * const store = createStore(state$_);
 * const rxState = new RxState(store);
 * const act_set_locale = rxState.act_(set_locale);
 * ...
 * rxState.watch(state => state.ui.global.locale).pipe(takeUntil(done$)).subscribe(locale => console.log('Locale changed to ' + locale));
 * ...
 * act_set_locale('en_US');
 */
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

  /** For debugging/testing. */
  dbgGetCheckWatchersMs = () => this.DEBOUNCE_CHECK_WATCHERS_MS;
  /** For debugging/testing. */
  dbgGetStore = () => this.store;
  /** For debugging/testing. */
  dbgGetWatchers = () => this.watchers.length;

  /**
   * Dispatch an `Action` using an `Actor`, typesafe value and optionally a pre-`transform` function.
   * @example
   * const set_locale = actor<string>('SET', STATE, STATE_GLOBAL, 'locale');
   * ...
   * rxState.act(set_locale, newCurrentLocale, or_('en_US'));
   */
  act = <T>(act: Actor<T>, value: T, transform?: (val: T) => T) => this.store.dispatch(act.new(transform ? transform(value) : value));

  /**
   * Create a dispatcher of an `Action` using an `Actor` optionally a pre-`transform` function.
   * @example
   * const set_locale = actor<string>('SET', STATE, STATE_GLOBAL, 'locale');
   * ...
   * const act_set_locale = rxState.act_(set_locale, or_('en_US'));
   * ...
   * act_set_locale(newCurrentLocale);
   */
  act_ = <T>(act: Actor<T>, transform?: (val: T) => T) => (value: T) => this.act(act, value, transform);

  /**
   * Watch the state for changes.
   * *WARNING: the watcher function should only use it's parameters and const values.*
   * FYI: a watcher is reused internally until there are no more subscribers AND optional `until` fired at least once.
   * @example
   * class LocaleComponent {
   * constructor(private readonly rxState: RxState<MyState>){}
   * private readonly done$ = new Subject();
   * readonly locale$ = this.rxState.watch(state => state.ui.global.locale, done$);
   * destroy() { done$.next(); done$.complete(); }
   * }
   */
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
