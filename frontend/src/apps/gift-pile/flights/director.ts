import type { Scoop } from '../core/protocol';
import type { Hooks, Overlay, Peek } from '../render/overlay';
import type { Craft, World } from './crafts/craft';
import { HotAirBalloon } from './crafts/hot-air-balloon';
import { Hypercar } from './crafts/hypercar';
import { PaperPlane } from './crafts/paper-plane';
import { Flight } from './flight';
import { ActionQueue, type Traffic } from './queue';
import type { FlightSink } from './sink';

interface Options {
  /** Random numbers in [0, 1). */
  rng?: () => number;
  /** The crafts to pick from; one of each unless given. */
  crafts?: readonly Craft[];
}

/** One of every craft. */
export const allCrafts = (): Craft[] => [new PaperPlane(), new HotAirBalloon(), new Hypercar()];

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
 * Runs the removals: takes the presses of 添加 and 减少 (an `ActionQueue`), picks a craft
 * for each removal from a shuffle bag, and keeps the `Flight` in the air, drawing it over
 * the pile as the renderer's overlay. Icons a flight spits back out are watched as they
 * fall: one that falls into the bin is destroyed too, so the user can move the bin to catch
 * them. Every icon a flight takes ends up released or destroyed: when the craft is gone, and
 * at once on `reset()`, since the engine has already let go of everything then.
 */
export class FlightDirector implements Overlay, Traffic {
  private readonly queue: ActionQueue;
  private flight: Flight | null = null;
  /** When the last flight ended, for the gap before the next. */
  lastEnded = -Infinity;
  /** Every icon in the flight, waiting, lifting or inside. */
  private readonly inFlight = new Set<number>();
  /** Icons spat out and still falling, which the bin may catch, and when each was dropped. */
  private readonly falling = new Map<number, number>();
  private bin: BinTarget | null = null;
  private readonly rng: () => number;
  private readonly crafts: readonly Craft[];
  /** The crafts still to go in this round (see `nextCraft`), and the one that went last. */
  private bag: Craft[] = [];
  private lastCraft: Craft | null = null;

  constructor(
    private readonly sink: FlightSink,
    { rng = Math.random, crafts = allCrafts() }: Options = {},
  ) {
    this.rng = rng;
    this.crafts = crafts;
    this.queue = new ActionQueue(sink, this);
  }

  /** A craft is up. */
  get busy(): boolean {
    return this.flight !== null;
  }

  /** Presses waiting their turn. */
  get queued(): number {
    return this.queue.length;
  }

  /** Icons asked for but still waiting on a craft to be gone before they drop in. */
  get pendingAdds(): number {
    return this.queue.pendingAdds;
  }

  /** Add `count` icons, at wall time `now`: at once, or after any craft that is up is gone. */
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
    return this.inFlight.has(id);
  }

  reset(): void {
    this.flight = null;
    this.lastEnded = -Infinity;
    this.inFlight.clear();
    this.falling.clear();
    this.queue.reset();
  }

  /** The icons the engine set aside for the next craft have arrived: it sets off at wall time `now`. */
  onScoop(scoop: Scoop, world: World, now: number): void {
    this.queue.scooped();
    if (scoop.ids.length === 0) return;
    this.flight = new Flight(this.sink, this.nextCraft(), scoop, world, now, this.rng);
    this.flight.forEachIcon((id) => this.inFlight.add(id));
  }

  /**
   * Draw the flight as of wall time `now`, ending it once the craft is gone, catch what
   * falls into the bin, and work through the queue when nothing is up.
   */
  draw(ctx: CanvasRenderingContext2D, now: number, hooks: Hooks): void {
    this.catchFalling(hooks.peek, now);
    const { flight } = this;
    if (flight) {
      if (flight.isOver(now)) {
        for (const id of flight.end(hooks.take)) this.inFlight.delete(id);
        this.flight = null;
        this.lastEnded = now;
      } else {
        flight.draw(ctx, now, hooks);
        for (const id of flight.drops()) {
          this.inFlight.delete(id);
          this.falling.set(id, now);
        }
      }
    }
    this.queue.tick(now);
  }

  /**
   * The craft for the next flight, from a shuffle bag: every craft goes once, in a random
   * order, before any goes again, so they come up as often as each other even over a few
   * flights, and the same one never goes twice running when there is a choice.
   */
  private nextCraft(): Craft {
    if (this.bag.length === 0) {
      const bag = [...this.crafts];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      // The next to go is the last in the bag; not the one that just went, if it can be helped.
      const last = bag.length - 1;
      if (bag.length > 1 && bag[last] === this.lastCraft) {
        const j = Math.floor(this.rng() * last);
        [bag[last], bag[j]] = [bag[j]!, bag[last]];
      }
      this.bag = bag;
    }
    const craft = this.bag.pop() ?? allCrafts()[0]!;
    this.lastCraft = craft;
    return craft;
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
