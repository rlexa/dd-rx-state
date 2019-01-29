import { actor, forceBool, forceNum, jsonEqual, orArray, orNull, orObject, orZero, or_, redMerge, redMergeProperty_, redSet, redSetPropertyIfNotEqual_, redSetPropertyIfNotSame_, reducers_, setPropertyIfNotEqual, setPropertyIfNotSame } from './index';

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
  });

  test('actor', () => {
    const set_authstring = actor<string>('SET', 'GLOBAL_STATE', 'NETWORK', 'SETTINGS', 'authstring');
    expect(set_authstring.type).toBe('SET_GLOBAL_STATE_NETWORK_SETTINGS_authstring');
    expect(set_authstring.new('User:Password')).toEqual({ type: 'SET_GLOBAL_STATE_NETWORK_SETTINGS_authstring', value: 'User:Password' });
  });

  // assemble$

  // assemble$_

  // toState$

  // toState$_

  // StoreImpl

  // createStore

  // RxState

});
