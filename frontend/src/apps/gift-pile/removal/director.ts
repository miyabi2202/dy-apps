import type { Scoop } from '../core/protocol';
import type { Hooks, Overlay, Peek } from '../render/overlay';
import type { Removal, Remover, World } from './board';
import { ActionQueue, type Traffic } from './queue';
import { ScoopBoard } from './scoop-board';
import type { RemovalSink } from './sink';

interface Options {
  /** The removers to deal from, at least one. */
  removers: readonly Remover[];
  /** Random numbers in [0, 1). */
  rng?: () => number;
}

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
 * Runs the removals: takes the presses of 添加 and 减少 (an `ActionQueue`), deals one of
 * the removers it was given for each removal from a shuffle bag, and keeps its `Removal`
 * going on a `ScoopBoard`, drawing it over the pile as the renderer's overlay. It knows
 * removers only as `Remover`s. Icons a removal drops back are watched as they fall: one that
 * falls into the bin is destroyed too, so the user can move the bin to catch them. The board
 * makes sure every icon of a removal ends up released or destroyed: when it is over, and at
 * once on `reset()`, since the engine has already let go of everything then.
 */
export class RemovalDirector implements Overlay, Traffic {
  private readonly queue: ActionQueue;
  /** The remover dealt for the scoop asked for, until its icons come. */
  private next: Remover | null = null;
  /** The removal under way, and its board. */
  private run: { removal: Removal; board: ScoopBoard } | null = null;
  /** When the last removal ended, for the gap before the next. */
  lastEnded = -Infinity;
  /** Icons spat out and still falling, which the bin may catch, and when each was dropped. */
  private readonly falling = new Map<number, number>();
  private bin: BinTarget | null = null;
  /** The wall time of the frame being drawn, for when icons are dropped. */
  private now = 0;
  private readonly rng: () => number;
  private readonly removers: readonly Remover[];
  /** The removers still to go in this round (see `nextRemover`), and the one that went last. */
  private bag: Remover[] = [];
  private lastRemover: Remover | null = null;

  constructor(
    private readonly sink: RemovalSink,
    { removers, rng = Math.random }: Options,
  ) {
    this.rng = rng;
    this.removers = removers;
    this.queue = new ActionQueue(sink, this);
  }

  /** A removal is under way. */
  get busy(): boolean {
    return this.run !== null;
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
    return this.run?.board.holds(id) ?? false;
  }

  reset(): void {
    this.run = null;
    this.lastEnded = -Infinity;
    this.falling.clear();
    this.queue.reset();
  }

  /**
   * The queue's turn for a removal: deal its remover now, so it can say where its icons
   * should come from, and ask the engine for them.
   */
  scoop(count: number, drop: number): void {
    this.next = this.nextRemover();
    this.sink.scoop(count, drop, this.next.aim?.(this.rng));
  }

  /** The icons the engine set aside for the next removal have arrived: it begins at wall time `now`. */
  onScoop(scoop: Scoop, world: World, now: number): void {
    this.queue.scooped();
    const remover = this.next ?? this.nextRemover();
    this.next = null;
    if (scoop.ids.length === 0) return;
    const board = new ScoopBoard(this.sink, scoop, world, (id) => this.falling.set(id, this.now));
    this.run = { removal: remover.begin(board, now, this.rng), board };
  }

  /**
   * Draw the removal as of wall time `now`, ending it once it is over, catch what falls
   * into the bin, and work through the queue when nothing is under way.
   */
  draw(ctx: CanvasRenderingContext2D, now: number, hooks: Hooks): void {
    this.now = now;
    this.catchFalling(hooks.peek, now);
    const { run } = this;
    if (run) {
      run.board.frame(hooks);
      if (run.removal.isOver(now)) {
        run.board.finish();
        this.run = null;
        this.lastEnded = now;
      } else {
        run.removal.draw(ctx, now);
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
    const remover = this.bag.pop() ?? this.removers[0]!;
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
