import { Subject, timer } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';
import { Action, actor, assemble$, assemble$_, createStore, forceBool, forceNum, jsonEqual, orArray, orNull, orObject, orZero, or_, redMerge, redMergeProperty_, redSet, redSetPropertyIfNotEqual_, redSetPropertyIfNotSame_, reducers_, RxState, setPropertyIfNotEqual, setPropertyIfNotSame, toState$, toState$_ } from './index';

describe('rx state', () => {

  test('jsonEqual', () => {
    expect(jsonEqual(1, 2)).toBe(false);
    expect(jsonEqual(1, 1)).toBe(true);
    expect(jsonEqual([1], [2])).toBe(false);
    expect(jsonEqual([1], [1])).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(jsonEqual(null, undefined)).toBe(false);
    expect(jsonEqual(null, null)).toBe(true);
    expect(jsonEqual(new Date(), new Date())).toBe(true);
  });

  test('forceBool', () => {
    expect(forceBool(false)).toBe(false);
    expect(forceBool(true)).toBe(true);
    expect(forceBool(<any>0)).toBe(false);
    expect(forceBool(<any>1)).toBe(true);
  });

  test('forceNum', () => {
    expect(forceNum(1)).toBe(1);
    expect(forceNum(<any>'1')).toBe(1);
  });

  test('or_', () => {
    expect(or_('hidden')('visible')).toBe('visible');
    expect(or_('hidden')('')).toBe('hidden');
  });

  test('orArray', () => {
    expect(orArray([1])).toEqual([1]);
    expect(orArray(null)).toEqual([]);
  });

  test('orNull', () => {
    expect(orNull(1)).toBe(1);
    expect(orNull(0)).toBe(null);
  });

  test('orObject', () => {
    expect(orObject({ a: 1 })).toEqual({ a: 1 });
    expect(orObject(null)).toEqual({});
  });

  test('orZero', () => {
    expect(orZero(1)).toBe(1);
    expect(orZero(null)).toBe(0);
  });

  test('setPropertyIfNotSame', () => {
    const nested = { b: 2 };
    const val = { a: nested };
    expect(setPropertyIfNotSame(val, 'a', nested)).toBe(val);
    expect(setPropertyIfNotSame(val, 'a', { b: 2 })).toEqual({ a: { b: 2 } });
    expect(setPropertyIfNotSame(null, 'a', { b: 2 })).toBe(null);
  });

  test('redSetPropertyIfNotSame_', () => {
    interface TestB { b: number };
    interface TestA { a: TestB };
    const nested = <TestB>{ b: 2 };
    const val = <TestA>{ a: nested };
    expect(redSetPropertyIfNotSame_<TestA, 'a'>('a')(val, nested)).toBe(val);
    expect(redSetPropertyIfNotSame_<TestA, 'a'>('a')(val, { b: 2 })).toEqual({ a: { b: 2 } });
    expect(redSetPropertyIfNotSame_<TestA, 'a'>('a')(null, { b: 2 })).toBe(null);
  });

  test('setPropertyIfNotEqual', () => {
    const nested = { b: 2 };
    const val = { a: nested };
    expect(setPropertyIfNotEqual(val, 'a', nested)).toBe(val);
    expect(setPropertyIfNotEqual(val, 'a', { b: 2 })).toBe(val);
    expect(setPropertyIfNotEqual(val, 'a', { b: 3 })).toEqual({ a: { b: 3 } });
    expect(setPropertyIfNotEqual(null, 'a', { b: 2 })).toBe(null);
  });

  test('redSetPropertyIfNotEqual_', () => {
    interface TestB { b: number };
    interface TestA { a: TestB };
    const nested = { b: 2 };
    const val = { a: nested };
    expect(redSetPropertyIfNotEqual_<TestA, 'a'>('a')(val, nested)).toBe(val);
    expect(redSetPropertyIfNotEqual_<TestA, 'a'>('a')(val, { b: 2 })).toBe(val);
    expect(redSetPropertyIfNotEqual_<TestA, 'a'>('a')(val, { b: 3 })).toEqual({ a: { b: 3 } });
    expect(redSetPropertyIfNotEqual_<TestA, 'a'>('a')(null, { b: 2 })).toBe(null);
  });

  test('redSet', () => {
    const val1 = { a: 1 };
    const val2 = { a: 1 };
    expect(redSet(val1, val1)).toBe(val1);
    expect(redSet(val1, val2)).toBe(val2);
  });

  test('redMerge', () => {
    interface Test { a?: number, b?: number };
    const val1 = <Test>{ a: 1, b: 1 };
    const val2 = <Test>{ b: 2 };
    expect(redMerge(val1, val1)).toBe(val1);
    expect(redMerge(val1, val2)).toEqual({ a: 1, b: 2 });
  });

  test('redMergeProperty_', () => {
    interface TestB { b?: number, c?: number };
    interface TestA { a: TestB };
    const nested = <TestB>{ b: 2, c: 3 };
    const val = <TestA>{ a: nested };
    expect(redMergeProperty_<TestA, 'a'>('a')(val, nested)).toBe(val);
    expect(redMergeProperty_<TestA, 'a'>('a')(val, <TestB>{ c: 4 })).toEqual({ a: { b: 2, c: 4 } });
  });

  test('reducers_', () => {
    interface Test { a?: number, b?: string, c?: boolean };
    const red = reducers_<Test>({
      'IncrementValueIntoA': (state, val: number) => ({ ...state, a: val + 1 }),
      'TrimValueIntoB': (state, val: string) => ({ ...state, b: (val || '').trim() }),
      'ToggleValueIntoC': (state, val: boolean) => ({ ...state, c: !val }),
    });
    expect(red({ a: 0, b: '', c: false }, { type: 'IncrementValueIntoA', value: 1 })).toEqual({ a: 2, b: '', c: false });
    expect(red({ a: 0, b: '', c: false }, { type: 'TrimValueIntoB', value: '  trimmed!  ' })).toEqual({ a: 0, b: 'trimmed!', c: false });
    expect(red({ a: 0, b: '', c: false }, { type: 'ToggleValueIntoC', value: false })).toEqual({ a: 0, b: '', c: true });
    expect(red({ a: 0, b: '', c: false }, { type: 'SomeOtherAction', value: 'some value' })).toEqual({ a: 0, b: '', c: false });
  });

  test('actor', () => {
    const set_authstring = actor<string>('SET', 'GLOBAL_STATE', 'NETWORK', 'SETTINGS', 'authstring');
    expect(set_authstring.type).toBe('SET_GLOBAL_STATE_NETWORK_SETTINGS_authstring');
    expect(set_authstring.new('User:Password')).toEqual({ type: 'SET_GLOBAL_STATE_NETWORK_SETTINGS_authstring', value: 'User:Password' });
  });

  test('toState$', () => {
    interface Test { a?: number, b?: string, c?: boolean };
    let state = <Test>null;

    const action$ = new Subject<Action<any>>();
    const state$ = toState$(action$, <Test>{ a: 0, b: '', c: false }, reducers_({ 'ActMerge': redMerge }));
    state$.subscribe(_ => state = _);
    expect(state).toEqual({ a: 0, b: '', c: false });
    expect(action$.observers.length).toBe(1);

    action$.next({ type: 'SomeAction', value: <Test>{ a: 1 } });
    expect(state).toEqual({ a: 0, b: '', c: false });

    action$.next({ type: 'ActMerge', value: <Test>{ a: 1 } });
    expect(state).toEqual({ a: 1, b: '', c: false });

    action$.complete();
  });

  test('toState$_', () => {
    interface Test { a?: number, b?: string, c?: boolean };
    let state = <Test>null;
    const state$_ = toState$_(<Test>{ a: 0, b: '', c: false }, reducers_({ 'ActMerge': redMerge }));

    const action$ = new Subject<Action<any>>();
    state$_(action$).subscribe(_ => state = _);
    expect(state).toEqual({ a: 0, b: '', c: false });
    expect(action$.observers.length).toBe(1);

    action$.next({ type: 'SomeAction', value: <Test>{ a: 1 } });
    expect(state).toEqual({ a: 0, b: '', c: false });

    action$.next({ type: 'ActMerge', value: <Test>{ a: 1 } });
    expect(state).toEqual({ a: 1, b: '', c: false });

    action$.complete();
  });

  test('assemble$ with base being just init object', () => {
    interface TestNested { a?: number, b?: string, c?: boolean };
    interface Test { a?: TestNested, b?: string };
    let state = <Test>null;

    const action$ = new Subject<Action<any>>();
    const state_nested$ = toState$(action$, <TestNested>{ a: 0, b: 'nested', c: false }, reducers_({ 'ActMerge': redMerge }));
    const state$ = assemble$(<Test>{ a: null, b: 'parent' }, { 'a': state_nested$ });
    state$.subscribe(_ => state = _);
    expect(state).toEqual({ a: { a: 0, b: 'nested', c: false }, b: 'parent' });
    expect(action$.observers.length).toBe(1);

    action$.next({ type: 'SomeAction', value: { a: 2 } });
    expect(state).toEqual({ a: { a: 0, b: 'nested', c: false }, b: 'parent' });

    action$.next({ type: 'ActMerge', value: <TestNested>{ a: 1 } });
    expect(state).toEqual({ a: { a: 1, b: 'nested', c: false }, b: 'parent' });

    action$.complete();
  });

  test('assemble$ with base being observable itself', () => {
    interface TestNested { a?: number, b?: string, c?: boolean };
    interface Test { a?: TestNested, b?: string };
    let state = <Test>null;

    const action$ = new Subject<Action<any>>();
    const state_nested$ = toState$(action$, <TestNested>{ a: 0, b: 'nested', c: false }, reducers_({ 'ActMerge': redMerge }));
    const state_parent$ = toState$(action$, <Test>{ a: null, b: 'parent' }, reducers_({ 'ActSetB': redSetPropertyIfNotSame_('b') }));
    const state$ = assemble$(state_parent$, { 'a': state_nested$ });
    state$.subscribe(_ => state = _);
    expect(state).toEqual({ a: { a: 0, b: 'nested', c: false }, b: 'parent' });
    expect(action$.observers.length).toBe(2);

    action$.next({ type: 'SomeAction', value: { a: 2 } });
    expect(state).toEqual({ a: { a: 0, b: 'nested', c: false }, b: 'parent' });

    action$.next({ type: 'ActMerge', value: <TestNested>{ a: 1 } });
    expect(state).toEqual({ a: { a: 1, b: 'nested', c: false }, b: 'parent' });

    action$.next({ type: 'ActSetB', value: 'proud parent' });
    expect(state).toEqual({ a: { a: 1, b: 'nested', c: false }, b: 'proud parent' });

    action$.complete();
  });

  test('assemble$_ with base being just init object', () => {
    interface TestNested { a?: number, b?: string, c?: boolean };
    interface Test { a?: TestNested, b?: string };
    let state = <Test>null;

    const state_nested$_ = toState$_(<TestNested>{ a: 0, b: 'nested', c: false }, reducers_({ 'ActMerge': redMerge }));
    const state$_ = assemble$_(<Test>{ a: null, b: 'parent' }, { 'a': state_nested$_ });

    const action$ = new Subject<Action<any>>();
    state$_(action$).subscribe(_ => state = _);
    expect(state).toEqual({ a: { a: 0, b: 'nested', c: false }, b: 'parent' });
    expect(action$.observers.length).toBe(1);

    action$.next({ type: 'SomeAction', value: { a: 2 } });
    expect(state).toEqual({ a: { a: 0, b: 'nested', c: false }, b: 'parent' });

    action$.next({ type: 'ActMerge', value: <TestNested>{ a: 1 } });
    expect(state).toEqual({ a: { a: 1, b: 'nested', c: false }, b: 'parent' });

    action$.complete();
  });

  test('assemble$_ with base being observable itself', () => {
    interface TestNested { a?: number, b?: string, c?: boolean };
    interface Test { a?: TestNested, b?: string };
    let state = <Test>null;

    const state_nested$_ = toState$_(<TestNested>{ a: 0, b: 'nested', c: false }, reducers_({ 'ActMerge': redMerge }));
    const state_parent$_ = toState$_(<Test>{ a: null, b: 'parent' }, reducers_({ 'ActSetB': redSetPropertyIfNotSame_('b') }));
    const state$_ = assemble$_(state_parent$_, { 'a': state_nested$_ });

    const action$ = new Subject<Action<any>>();
    state$_(action$).subscribe(_ => state = _);
    expect(state).toEqual({ a: { a: 0, b: 'nested', c: false }, b: 'parent' });
    expect(action$.observers.length).toBe(2);

    action$.next({ type: 'SomeAction', value: { a: 2 } });
    expect(state).toEqual({ a: { a: 0, b: 'nested', c: false }, b: 'parent' });

    action$.next({ type: 'ActMerge', value: <TestNested>{ a: 1 } });
    expect(state).toEqual({ a: { a: 1, b: 'nested', c: false }, b: 'parent' });

    action$.next({ type: 'ActSetB', value: 'proud parent' });
    expect(state).toEqual({ a: { a: 1, b: 'nested', c: false }, b: 'proud parent' });

    action$.complete();
  });

  test('createStore', () => {
    interface TestNested { e?: string };
    interface Test { a?: number, b?: string, c?: boolean, d?: TestNested };

    const set_a = actor<number>('SetA');
    const set_b = actor<string>('SetB');
    const set_c = actor<boolean>('SetC');
    const set_e = actor<string>('SetE');
    const state_parent$ = toState$_(
      <Test>{ a: 0, b: '', c: false, d: null },
      reducers_({
        [set_a.type]: redSetPropertyIfNotSame_('a'),
        [set_b.type]: redSetPropertyIfNotSame_('b'),
        [set_c.type]: redSetPropertyIfNotSame_('c'),
      }));
    const state_nested$ = toState$_(
      <TestNested>{ e: '' },
      reducers_({
        [set_e.type]: redSetPropertyIfNotSame_('e'),
      }));
    const state$ = assemble$_(state_parent$, { d: state_nested$ });

    const store = createStore(state$);

    let state = <Test>null;
    store.state$.subscribe(_ => state = _);
    expect(state).toEqual({ a: 0, b: '', c: false, d: { e: '' } });
    expect(store.getState()).toEqual({ a: 0, b: '', c: false, d: { e: '' } });

    store.dispatch(set_a.new(1));
    expect(state).toEqual({ a: 1, b: '', c: false, d: { e: '' } });
    expect(store.getState()).toEqual({ a: 1, b: '', c: false, d: { e: '' } });

    store.dispatch(set_b.new('yep'));
    expect(state).toEqual({ a: 1, b: 'yep', c: false, d: { e: '' } });
    expect(store.getState()).toEqual({ a: 1, b: 'yep', c: false, d: { e: '' } });

    store.dispatch(set_c.new(true));
    expect(state).toEqual({ a: 1, b: 'yep', c: true, d: { e: '' } });
    expect(store.getState()).toEqual({ a: 1, b: 'yep', c: true, d: { e: '' } });

    store.dispatch(set_e.new('nested'));
    expect(state).toEqual({ a: 1, b: 'yep', c: true, d: { e: 'nested' } });
    expect(store.getState()).toEqual({ a: 1, b: 'yep', c: true, d: { e: 'nested' } });

    store.destruct();
  });

  test('RxState', done => {
    interface TestNested { e?: string };
    interface Test { a?: number, b?: string, c?: boolean, d?: TestNested };

    const set_a = actor<number>('SetA');
    const set_b = actor<string>('SetB');
    const set_c = actor<boolean>('SetC');
    const set_e = actor<string>('SetE');
    const state_parent$ = toState$_(
      <Test>{ a: 0, b: '', c: false, d: null },
      reducers_({
        [set_a.type]: redSetPropertyIfNotSame_('a'),
        [set_b.type]: redSetPropertyIfNotSame_('b'),
        [set_c.type]: redSetPropertyIfNotSame_('c'),
      }));
    const state_nested$ = toState$_(
      <TestNested>{ e: '' },
      reducers_({
        [set_e.type]: redSetPropertyIfNotSame_('e'),
      }));
    const state$ = assemble$_(state_parent$, { d: state_nested$ });

    const rxState = new RxState(createStore(state$));
    const act_set_a = rxState.act_(set_a);
    const act_set_b = rxState.act_(set_b);
    const act_set_c = rxState.act_(set_c);
    const act_set_e = rxState.act_(set_e);

    const done$ = new Subject();
    expect(rxState.dbgGetWatchers()).toBe(0);

    let state_e = <string>null;
    rxState.watch(state => state.d.e, done$).pipe(takeUntil(done$)).subscribe(_ => state_e = _);
    expect(rxState.dbgGetWatchers()).toBe(1);

    expect(rxState.state).toEqual({ a: 0, b: '', c: false, d: { e: '' } });
    expect(state_e).toBe('');

    act_set_a(1);
    expect(rxState.state).toEqual({ a: 1, b: '', c: false, d: { e: '' } });
    expect(state_e).toBe('');

    act_set_b('yep');
    expect(rxState.state).toEqual({ a: 1, b: 'yep', c: false, d: { e: '' } });
    expect(state_e).toBe('');

    act_set_c(true);
    expect(rxState.state).toEqual({ a: 1, b: 'yep', c: true, d: { e: '' } });
    expect(state_e).toBe('');

    act_set_e('nested');
    expect(rxState.state).toEqual({ a: 1, b: 'yep', c: true, d: { e: 'nested' } });
    expect(state_e).toBe('nested');

    done$.next();
    done$.complete();
    timer(1000).pipe(take(1)).subscribe(() => {
      expect(rxState.dbgGetWatchers()).toBe(0);
      rxState.destroy();
      done();
    });
  });

});
