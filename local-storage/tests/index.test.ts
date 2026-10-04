import { createStore, KEY_PREFIX } from '../src';

const asNumber = (raw: unknown) => (typeof raw === 'number' ? raw : undefined);

beforeEach(() => localStorage.clear());

test('round-trips a value under the prefixed key', () => {
  const store = createStore('test.count', { fallback: 0, parse: asNumber });
  expect(store.read()).toBe(0);
  store.write(42);
  expect(localStorage.getItem(`${KEY_PREFIX}test.count`)).toBe('42');
  expect(store.read()).toBe(42);
});

test('clear removes the value', () => {
  const store = createStore('test.count', { fallback: 0, parse: asNumber });
  store.write(7);
  store.clear();
  expect(store.read()).toBe(0);
});

test('falls back on invalid JSON or a rejected value', () => {
  const store = createStore('test.count', { fallback: 1, parse: asNumber });
  localStorage.setItem(store.key, '{not json');
  expect(store.read()).toBe(1);
  localStorage.setItem(store.key, '"a string"');
  expect(store.read()).toBe(1);
});

test('falls back when storage throws', () => {
  const store = createStore('test.count', { fallback: 3, parse: asNumber });
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('SecurityError');
  });
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });
  expect(() => store.write(5)).not.toThrow();
  expect(store.read()).toBe(3);
  get.mockRestore();
  set.mockRestore();
});
