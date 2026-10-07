import type { Scoop } from '../core/protocol';
import type { Hooks, Take } from '../render/overlay';
import type { RemovalSink } from './sink';

/** The canvas, in world pixels. */
export interface World {
  width: number;
  height: number;
}

/**
 * One way of carrying icons off: a craft flying over (`Flyover`), say. The director deals
 * one for each removal and has it `begin`; it picks its own colours and the like with `rng`.
 * To add one, implement this and list it where the removers are made.
 */
export interface Remover {
  /** A short name, for tests and debugging. */
  readonly name: string;
  /** Start carrying off the icons of `scoop` at wall time `now`. */
  begin(sink: RemovalSink, scoop: Scoop, world: World, now: number, rng: () => number): Removal;
}

/**
 * One removal under way, drawn over the pile each frame until it is over. Keeps a `Haul` of
 * its icons, so each ends up dropped back or destroyed.
 */
export interface Removal {
  /** Nothing of it is left to see. */
  isOver(now: number): boolean;
  /** Draw it as of wall time `now`, taking icons from the pile and dropping some back as it goes. */
  draw(ctx: CanvasRenderingContext2D, now: number, hooks: Hooks): void;
  /** Icons dropped back since the last call. */
  drops(): number[];
  /** It is over: whatever it still holds is destroyed. Returns those icons. */
  end(take: Take): number[];
}

/** One of `items`, picked with `rng` (random numbers in [0, 1)). */
export function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** Where a removal's icon is. */
const IN_PILE = 0; // drawn by the renderer
const TAKEN = 1; // grabbed, the removal's to draw
const DROPPED = 2; // let go, the engine's again

/**
 * The icons of one scoop and what has become of each: still in the pile, taken, or dropped
 * back. Every removal keeps one, so whatever it does with them, each is grabbed before it
 * moves, and is in the end either released or destroyed. Icons are numbered `0` to `size - 1`
 * in the scoop's order.
 */
export class Haul {
  private readonly ids: Int32Array;
  private readonly state: Uint8Array;
  private dropped: number[] = [];

  constructor(
    private readonly sink: RemovalSink,
    scoop: Scoop,
  ) {
    this.ids = scoop.ids;
    this.state = new Uint8Array(scoop.ids.length);
  }

  get size(): number {
    return this.ids.length;
  }

  inPile(k: number): boolean {
    return this.state[k] === IN_PILE;
  }

  isDropped(k: number): boolean {
    return this.state[k] === DROPPED;
  }

  /**
   * Take icon `k` out of the pile, if it is still there; whatever rested on it falls. Returns
   * where the renderer had it, or null if it didn't or the icon was taken already.
   */
  take(k: number, take: Take): { x: number; y: number } | null {
    if (this.state[k] !== IN_PILE) return null;
    const id = this.ids[k]!;
    const at = take(id);
    this.sink.grab(id);
    this.state[k] = TAKEN;
    return at;
  }

  /** Let icon `k` go at (x, y), to fall back onto the pile, taking it first if need be. */
  drop(k: number, x: number, y: number, take: Take): void {
    if (this.state[k] === DROPPED) return;
    this.take(k, take);
    const id = this.ids[k]!;
    this.state[k] = DROPPED;
    this.dropped.push(id);
    this.sink.release(id, x, y);
  }

  /** Icons dropped since the last call. */
  drops(): number[] {
    const out = this.dropped;
    this.dropped = [];
    return out;
  }

  /** Destroy every icon not dropped, taking any still in the pile (the tab was hidden). Returns them. */
  end(take: Take): number[] {
    const gone: number[] = [];
    this.ids.forEach((id, k) => {
      if (this.state[k] === DROPPED) return;
      this.take(k, take);
      this.sink.destroy(id);
      gone.push(id);
    });
    return gone;
  }
}
