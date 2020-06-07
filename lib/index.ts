import {BehaviorSubject, combineLatest, isObservable, merge, Observable, of, OperatorFunction, Subject} from 'rxjs';
import {distinctUntilChanged, map, scan, shareReplay, takeUntil, startWith} from 'rxjs/operators';

export interface Action<T> {
  /** Make sure that the `type` is globally unique. */
  type: string;
  value: T;
}

export type ActionStream = Observable<Action<any>>;
export type ActionReducer<T> = (state: T, action: Action<any>) => T;
export type ValueReducer<T, A = any> = (state: T, value: A) => T;
export type StreamToState<T> = (action$: ActionStream) => Observable<T>;

export type ActionHandlerMap<T> = Record<string, ValueReducer<T>>;

/** Wrapper for creating `Action<T>`s. */
export interface Actor<T> {
  type: string;
  new: (value: T) => Action<T>;
}

/** Similar to Redux store. */
export interface Store<T> {
  action$: ActionStream;
  state$: Observable<T>;
  getState(): T;
  dispatch(action: Action<any>): void;
  destruct(): void;
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
  !state || state[key] === value ? state : Object.assign({}, state, {[key]: value});

/** Returns a reducer based on `setPropertyIfNotSame`. */
export const redSetPropertyIfNotSame_ = <T extends object, K extends keyof T>(key: K): ValueReducer<T, T[K]> => (state, value) =>
  setPropertyIfNotSame(state, key, value);

/** Sets `state[key] = value` if not content-equal and returns as new state. */
export const setPropertyIfNotEqual = <T extends object, K extends keyof T>(state: T, key: K, value: T[K]): T =>
  !state || state[key] === value || jsonEqual(state[key], value) ? state : Object.assign({}, state, {[key]: value});

/** Returns a reducer based on `setPropertyIfNotEqual`. */
export const redSetPropertyIfNotEqual_ = <T extends object, K extends keyof T>(key: K): ValueReducer<T, T[K]> => (state, value) =>
  setPropertyIfNotEqual(state, key, value);

/** Reducer for setting `value` as new state. */
export const redSet = <T extends object>(state: T, value: T) => value;

/** Reducer for merging `value` into `state` as new state. */
export const redMerge = <T extends object>(state: T, value: T): T => {
  state = state || <T>{};
  value = value || <T>{};
  const ret =
    typeof state === 'object' && typeof value === 'object' && Object.entries(value).every(([key, val]) => state[key] === val)
      ? state
      : Object.assign({} as T, state, value);
  return ret;
};

/** Returns a reducer which merges the `value` into the `state[key]` as new state. */
export const redMergeProperty_ = <T extends object, K extends keyof T>(key: K): ValueReducer<T, T[K]> => (state, value) => {
  state = state || <T>{};
  const nested = (state[key] as any) as object;
  const merged = redMerge(nested, (value as any) as object);
  const ret = nested === merged ? state : Object.assign({}, state, {[key]: merged});
  return ret;
};

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
export const reducers_ = <T>(actionTypeToHandler: ActionHandlerMap<T>): ActionReducer<T> => (state, action) =>
  actionTypeToHandler && action.type in actionTypeToHandler ? actionTypeToHandler[action.type](state, action.value) : state;

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
  return <Actor<T>>{type: _type, new: (value: T) => <Action<T>>{type: _type, value}};
};

/**
 * Creates a state Observable emitting new state from scanning the `action$` stream.
 * @example
 * interface Test { a?: number, b?: string, c?: boolean };
 * const action$ = new Subject<Action<any>>();
 * const state$ = toState$(action$, <Test>{ a: 0, b: '', c: false }, { 'ActMerge': redMerge });
 */
export const toState$ = <T>(action$: ActionStream, init: T, reduce: ActionReducer<T> | ActionHandlerMap<T>) =>
  merge(of(init), action$.pipe(scan(typeof reduce === 'function' ? reduce : reducers_(reduce), init))).pipe(distinctUntilChanged());

/**
 * Returns a creator for a state Observable emitting new state from scanning the `action$` stream.
 * @example
 * interface Test { a?: number, b?: string, c?: boolean };
 * const state$_ = toState$_(<Test>{ a: 0, b: '', c: false }, { 'ActMerge': redMerge });
 * ...
 * const state$ = state$_(action$);
 */
export const toState$_ = <T>(init: T, reduce: ActionReducer<T> | ActionHandlerMap<T>) => (action$: ActionStream) =>
  toState$(action$, init, reduce);

/**
 * Assembles a state Observable emitting new state from combining a `base` object or Observable and `parts` values or Observables which relate to the `base` keys.
 * *WARNING: a nested state from `parts` should not be reduced in the `base` if the `base` is an Observable.*
 * @example
 * interface TestNested { a?: number, b?: string, c?: boolean };
 * interface Test { a?: TestNested, b?: string };
 * const action$ = new Subject<Action<any>>();
 * const state_nested$ = toState$(action$, <TestNested>{ a: 0, b: 'nested', c: false }, { 'ActMerge': redMerge });
 * const state_parent$ = toState$(action$, <Test>{ a: null, b: 'parent' }, { 'ActSetB': redSetPropertyIfNotSame_('b') });
 * const state$ = assemble$(state_parent$, { 'a': state_nested$ });
 */
export const assemble$ = <T extends object>(base: T | Observable<T>, parts?: Partial<{[K in keyof T]: Observable<T[K]> | T[K]}>) => {
  const toCombine = [isObservable(base) ? base : of(typeof base === 'object' ? base : <T>{})];
  if (parts && Object.keys(parts).length) {
    const part$s = Object.entries(parts)
      .filter(([key]) => typeof key === 'string')
      .map(([key, value]) => (isObservable(value) ? value : of(value)).pipe(map((_) => <T>{[key]: _})));
    toCombine.push(merge(...part$s).pipe(scan((acc, val) => Object.assign(<T>{}, acc || <T>{}, val || <T>{}), <T>{})));
  }
  return combineLatest(toCombine).pipe(map(([into, from]) => Object.assign(<T>{}, into, from)));
};

/**
 * Returns a creator for assembling a state Observable emitting new state from combining a `base` object or Observable and `parts` values
 * or Observables which relate to the `base` keys.
 * *WARNING: a nested state from `parts` should not be reduced in the `base` if the `base` is an Observable.*
 * @example
 * interface TestNested { a?: number, b?: string, c?: boolean };
 * interface Test { a?: TestNested, b?: string };
 * const state_nested$_ = toState$_(<TestNested>{ a: 0, b: 'nested', c: false }, { 'ActMerge': redMerge });
 * const state_parent$_ = toState$_(<Test>{ a: null, b: 'parent' }, { 'ActSetB': redSetPropertyIfNotSame_('b') });
 * const state$_ = assemble$_(state_parent$_, { 'a': state_nested$_ });
 * ...
 * const state$ = state$_(action$);
 */
export const assemble$_ = <T extends object>(base: T | StreamToState<T>, parts?: {[K in keyof T]: T[K] | StreamToState<T[K]>}) => (
  action$: ActionStream,
) => {
  const assembleBase = typeof base === 'function' ? (base as StreamToState<T>)(action$) : base;
  const assembleParts =
    !parts || !Object.keys(parts).length
      ? null
      : Object.entries(parts || {}).reduce<Partial<{[K in keyof T]: Observable<T[K]> | T[K]}>>(
          (acc, [key, value]) => Object.assign(acc, {[key]: typeof value === 'function' ? (value as StreamToState<T>)(action$) : value}),
          {},
        );
  return assemble$(assembleBase, assembleParts);
};

/**
 * Creates a state Observable (from init object, reducers and nested parts) emitting new state from scanning the `action$` stream.
 * @example
 * interface TestNested { c?: number };
 * interface Test { a?: TestNested, b?: string };
 * const action$ = new Subject<Action<any>>();
 * const state_nested$ = initReduceAssemble$(action$, <TestNested>{ c: 0 }, { 'ActSetC': redSetPropertyIfNotSame_('c') });
 * const state$ = initReduceAssemble$(action$, <Test>{ a: null, b: 'parent' }, { 'ActSetB': redSetPropertyIfNotSame_('b') }, { a: state_nested$ });
 */
export const initReduceAssemble$ = <T extends object>(
  action$: ActionStream,
  init: T,
  reduce: ActionReducer<T> | ActionHandlerMap<T>,
  parts?: {[K in keyof T]: T[K] | Observable<T[K]>},
) => assemble$(toState$(action$, init, reduce), parts);

/**
 * Returns a creator for a state Observable (from init object, reducers and nested parts) emitting new state from scanning the `action$` stream.
 * @example
 * interface TestNested { c?: number };
 * interface Test { a?: TestNested, b?: string };
 * const state_nested$_ = initReduceAssemble$_(<TestNested>{ c: 0 }, { 'ActSetC': redSetPropertyIfNotSame_('c') });
 * const state$_ = initReduceAssemble$_(<Test>{ a: null, b: 'parent' }, { 'ActSetB': redSetPropertyIfNotSame_('b') }, { a: state_nested$_ });
 * ...
 * const state$ = state$_(action$);
 */
export const initReduceAssemble$_ = <T extends object>(
  init: T,
  reduce: ActionReducer<T> | ActionHandlerMap<T>,
  parts?: {[K in keyof T]: T[K] | StreamToState<T[K]>},
) => assemble$_(toState$_(init, reduce), parts);

class StoreImpl<T> implements Store<T> {
  constructor(private readonly createState: StreamToState<T>) {
    this.state$.subscribe((state) => (this.state = state));
  }

  private state: T = null;
  private readonly actionIn$ = new Subject<Action<any>>();

  public readonly action$ = this.actionIn$.pipe(map((action) => <Action<any>>{...action}));
  public readonly state$ = this.createState(this.actionIn$);

  getState() {
    return this.state;
  }

  dispatch(action: Action<any>) {
    this.actionIn$.next(action);
  }

  destruct() {
    this.actionIn$.complete();
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

/**
 * Helper function for watching substates.
 *
 * @param selector mapper function e.g. `st => st.ui.enabled`
 *
 * @example
 * enabled$ = this.stateService.state$.pipe(watch(st => st.ui.enabled));
 */
export function watch<T, R>(selector: (state: T) => R): OperatorFunction<T, R> {
  return (source: Observable<T>) =>
    source.pipe(
      map((st) => selector(st)),
      distinctUntilChanged(),
    );
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
 * rxState.state$.pipe(select(st => st.ui.global.locale)).subscribe(locale => console.log('Locale changed to ' + locale));
 * ...
 * act_set_locale('en_US');
 */
export class RxState<S> {
  constructor(protected readonly store: Store<S>) {
    store.state$.pipe(startWith(store.getState()), takeUntil(this.done$)).subscribe((state) => this.currentState$.next(state));
  }

  private readonly done$ = new Subject();
  private readonly currentState$ = new BehaviorSubject<S>(null);

  /** Reactive state (use with `.pipe(select(...))` operator) */
  public readonly state$ = this.currentState$.pipe(shareReplay({refCount: true, bufferSize: 1}), takeUntil(this.done$));

  /** Synchronized state value. */
  getState = () => this.currentState$.value;

  destroy() {
    this.currentState$.complete();
    this.done$.next();
    this.done$.complete();
    this.store.destruct();
  }

  /** For debugging/testing. */
  dbgGetStore = () => this.store;

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
}
