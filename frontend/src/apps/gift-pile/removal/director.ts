import type { Scoop } from '../core/protocol';
import type { Hooks, Overlay, Peek } from '../render/overlay';
import { Helicopter } from './flyover/crafts/helicopter';
import { HotAirBalloon } from './flyover/crafts/hot-air-balloon';
import { Hypercar } from './flyover/crafts/hypercar';
import { Ufo } from './flyover/crafts/ufo';
import { Flyover } from './flyover/flyover';
import { ActionQueue, type Traffic } from './queue';
import type { Removal, Remover, World } from './removal';
import type { RemovalSink } from './sink';

interface Options {
  /** Random numbers in [0, 1). */
  rng?: () => number;
  /** The removers to deal from; one of each unless given. */
  removers?: readonly Remover[];
}

/** One of every remover. */
export const allRemovers = (): Remover[] =>
  [new Helicopter(), new Ufo(), new HotAirBalloon(), new Hypercar()].map(
    (craft) => new Flyover(craft),
  );

/** The bin, in world pixels: a dropped icon whose centre comes within `half` of (x, y) is caught. */
export interface BinTarget {
  x: number;
  y: number;
  half: number;
  /** Called each time the bin catches one. */
  onCatch?: () => void;
}

/** A dropped icon the renderer can't find yet is given this long to show up in a frame before it is forgotten. */
const FALLING_GRACE_MS = 500;

/**
 * Runs the removals: takes the presses of 添加 and 减少 (an `ActionQueue`), deals a
 * `Remover` for each removal from a shuffle bag, and keeps its `Removal` going, drawing it
 * over the pile as the renderer's overlay. Icons a removal drops back are watched as they
 * fall: one that falls into the bin is destroyed too, so the user can move the bin to catch
 * them. Every icon a removal takes ends up released or destroyed: when it is over, and at
 * once on `reset()`, since the engine has already let go of everything then.
 */
export class RemovalDirector implements Overlay, Traffic {
  private readonly queue: ActionQueue;
  private removal: Removal | null = null;
  /** When the last removal ended, for the gap before the next. */
  lastEnded = -Infinity;
  /** Every icon of the removal under way, whether it has taken it yet or not. */
  private readonly carried = new Set<number>();
  /** Icons spat out and still falling, which the bin may catch, and when each was dropped. */
  private readonly falling = new Map<number, number>();
  private bin: BinTarget | null = null;
  private readonly rng: () => number;
  private readonly removers: readonly Remover[];
  /** The removers still to go in this round (see `nextRemover`), and the one that went last. */
  private bag: Remover[] = [];
  private lastRemover: Remover | null = null;

  constructor(
    private readonly sink: RemovalSink,
    { rng = Math.random, removers = allRemovers() }: Options = {},
  ) {
    this.rng = rng;
    this.removers = removers;
    this.queue = new ActionQueue(sink, this);
  }

  /** A removal is under way. */
  get busy(): boolean {
    return this.removal !== null;
  }

  /** Presses waiting their turn. */
  get queued(): number {
    return this.queue.length;
  }

  /** Icons asked for but still waiting on a removal to be over before they drop in. */
  get pendingAdds(): number {
    return this.queue.pendingAdds;
  }

  /** Add `count` icons, at wall time `now`: at once, or after any removal under way. */
  add(count: number, now: number): void {
    this.queue.add(count, now);
  }

  /** Remove `count` icons, at wall time `now`, when their turn comes. */
  remove(count: number, now: number): void {
    this.queue.remove(count, now);
  }

  /** Where the bin is, for catching dropped icons; null while there is none. */
  setBin(bin: BinTarget | null): void {
    this.bin = bin;
  }

  holds(id: number): boolean {
    return this.carried.has(id);
  }

  reset(): void {
    this.removal = null;
    this.lastEnded = -Infinity;
    this.carried.clear();
    this.falling.clear();
    this.queue.reset();
  }

  /** The icons the engine set aside for the next removal have arrived: it begins at wall time `now`. */
  onScoop(scoop: Scoop, world: World, now: number): void {
    this.queue.scooped();
    if (scoop.ids.length === 0) return;
    this.removal = this.nextRemover().begin(this.sink, scoop, world, now, this.rng);
    scoop.ids.forEach((id) => this.carried.add(id));
  }

  /**
   * Draw the removal as of wall time `now`, ending it once it is over, catch what falls
   * into the bin, and work through the queue when nothing is under way.
   */
  draw(ctx: CanvasRenderingContext2D, now: number, hooks: Hooks): void {
    this.catchFalling(hooks.peek, now);
    const { removal } = this;
    if (removal) {
      if (removal.isOver(now)) {
        for (const id of removal.end(hooks.take)) this.carried.delete(id);
        this.removal = null;
        this.lastEnded = now;
      } else {
        removal.draw(ctx, now, hooks);
        for (const id of removal.drops()) {
          this.carried.delete(id);
          this.falling.set(id, now);
        }
      }
    }
    this.queue.tick(now);
  }

  /**
   * The remover for the next removal, from a shuffle bag: every one goes once, in a random
   * order, before any goes again, so they come up as often as each other even over a few
   * removals, and the same one never goes twice running when there is a choice.
   */
  private nextRemover(): Remover {
    if (this.bag.length === 0) {
      const bag = [...this.removers];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      // The next to go is the last in the bag; not the one that just went, if it can be helped.
      const last = bag.length - 1;
      if (bag.length > 1 && bag[last] === this.lastRemover) {
        const j = Math.floor(this.rng() * last);
        [bag[last], bag[j]] = [bag[j]!, bag[last]];
      }
      this.bag = bag;
    }
    const remover = this.bag.pop() ?? allRemovers()[0]!;
    this.lastRemover = remover;
    return remover;
  }

  /**
   * Dropped icons that fall into the bin are destroyed; ones that land are forgotten, as are
   * ones the renderer hasn't seen for a while (destroyed some other way). A just-dropped icon
   * isn't in a frame until the engine has let it go, so it gets a moment to show up.
   */
  private catchFalling(peek: Peek, now: number): void {
    if (this.falling.size === 0) return;
    const { bin } = this;
    for (const [id, since] of this.falling) {
      const at = peek(id);
      if (!at || at.resting) {
        if (now - since > FALLING_GRACE_MS) this.falling.delete(id);
        continue;
      }
      if (bin && Math.abs(at.x - bin.x) <= bin.half && Math.abs(at.y - bin.y) <= bin.half) {
        this.falling.delete(id);
        this.sink.grab(id);
        this.sink.destroy(id);
        bin.onCatch?.();
      }
    }
  }
}
