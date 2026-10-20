/**
 * A small hand-written IoC container: no library, no decorators, no reflection. A `Token<T>` names
 * a thing the bot is built from; a factory registered for it makes it from other things the
 * container resolves, the first time anyone asks, and every later ask gets that same object (a
 * singleton). Registering a token again replaces its factory, so a test swaps a real adapter for a
 * fake before anything is resolved.
 */

/** The name of a `T` in a container. A token is its own key: two with the same name are two. */
export class Token<T> {
  /** Only there so TypeScript tells a Token<A> from a Token<B>; never set. */
  declare readonly type?: T;

  constructor(readonly name: string) {}

  toString(): string {
    return this.name;
  }
}

/** A token for a `T`, named `name` for the errors that mention it. */
export const token = <T>(name: string): Token<T> => new Token<T>(name);

/** Makes a `T`, asking `container` for what it's made from. */
export type Factory<T> = (container: Container) => T;

export class Container {
  private readonly factories = new Map<Token<unknown>, Factory<unknown>>();
  private readonly instances = new Map<Token<unknown>, unknown>();
  /** What's being made, outermost first, to tell a cycle from a chain. */
  private readonly making: Token<unknown>[] = [];

  /** Has `factory` make the `token`'s thing on first use; replaces an earlier factory. */
  register<T>(token: Token<T>, factory: Factory<T>): this {
    if (this.instances.has(token)) {
      throw new Error(`cannot register ${token.name}: it has been made already`);
    }
    this.factories.set(token, factory);
    return this;
  }

  /** Whether something is registered for `token`. */
  has(token: Token<unknown>): boolean {
    return this.factories.has(token);
  }

  /**
   * The `token`'s thing, made now if it wasn't yet. Throws when nothing is registered for it, and
   * when making it needs itself (`a -> b -> a`): a reference that points forward is resolved
   * later, when it's used, rather than while the thing is made.
   */
  resolve<T>(token: Token<T>): T {
    if (this.instances.has(token)) return this.instances.get(token) as T;
    const factory = this.factories.get(token);
    if (!factory) {
      const by = this.making.map((t) => t.name).join(' -> ');
      throw new Error(`nothing is registered for ${token.name}${by ? ` (needed by ${by})` : ''}`);
    }
    if (this.making.includes(token)) {
      const chain = [...this.making.slice(this.making.indexOf(token)), token].map((t) => t.name);
      throw new Error(`${token.name} needs itself: ${chain.join(' -> ')}`);
    }
    this.making.push(token);
    try {
      const made = factory(this) as T;
      this.instances.set(token, made);
      return made;
    } finally {
      this.making.pop();
    }
  }
}
