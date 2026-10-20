import { Container, token } from '../src/wiring/container';

const A = token<string>('a');
const B = token<string>('b');
const C = token<number>('c');

test('makes a thing on first use, from other things, once', () => {
  const made: string[] = [];
  const container = new Container()
    .register(A, () => (made.push('a'), 'A'))
    .register(B, (c) => (made.push('b'), `${c.resolve(A)}B`));

  expect(made).toEqual([]);
  expect(container.resolve(B)).toBe('AB');
  expect(container.resolve(B)).toBe('AB');
  expect(container.resolve(A)).toBe('A');
  expect(made).toEqual(['b', 'a']);
  expect(container.has(A)).toBe(true);
  expect(container.has(C)).toBe(false);
});

test('a token registered again is replaced, until it has been made', () => {
  const container = new Container().register(A, () => 'real');
  container.register(A, () => 'fake');
  expect(container.resolve(A)).toBe('fake');
  expect(() => container.register(A, () => 'too late')).toThrow('cannot register a');
});

test('says what is missing, and what needed it', () => {
  const container = new Container().register(B, (c) => c.resolve(A));
  expect(() => container.resolve(C)).toThrow('nothing is registered for c');
  expect(() => container.resolve(B)).toThrow('nothing is registered for a (needed by b)');
});

test('refuses a cycle, and a forward reference resolved when used is not one', () => {
  const cycle = new Container().register(A, (c) => c.resolve(B)).register(B, (c) => c.resolve(A));
  expect(() => cycle.resolve(A)).toThrow('a needs itself: a -> b -> a');

  // b points at a, which points back at b only when it's called: after both are made.
  interface Greeter {
    greet(): string;
  }
  interface Named {
    name: string;
    greeter: Greeter;
  }
  const greeter = token<Greeter>('greeter');
  const named = token<Named>('named');
  const forward = new Container()
    .register(greeter, (c) => ({ greet: () => `a says ${c.resolve(named).name}` }))
    .register(named, (c) => ({ name: 'b', greeter: c.resolve(greeter) }));
  expect(forward.resolve(named).greeter.greet()).toBe('a says b');
});

test('a failed factory leaves nothing made, and the next ask tries again', () => {
  let tries = 0;
  const container = new Container().register(A, () => {
    if (++tries === 1) throw new Error('boom');
    return 'A';
  });
  expect(() => container.resolve(A)).toThrow('boom');
  expect(container.resolve(A)).toBe('A');
});
