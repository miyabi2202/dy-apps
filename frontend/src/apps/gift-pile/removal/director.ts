import type { Scoop } from '../core/protocol';
import type { CutInRequest, Fx, Gfx, Removal, Remover, World } from './board';
import { ActionQueue, type Traffic } from './queue';
import { type Ground, ScoopBoard } from './scoop-board';
import type { RemovalSink } from './sink';

interface Options {
  /** What the removals' boards ask of the pile: where icons are, drawing, the camera. */
  ground: Ground;
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

/** A dropped icon the pile can't find yet is given this long to show up in a frame before it is forgotten. */
const FALLING_GRACE_MS = 500;

/** A cut-in is not shown if the last began under this long ago. */
const CUT_IN_COOLDOWN_MS = 8000;
/** The freeze-frame and shake of a cut-in, when its request names none. */
const DEFAULT_HIT_STOP_MS = 90;
const DEFAULT_CUT_IN_SHAKE = 4;
const CUT_IN_SHAKE_MS = 300;

/** Which of the showy extras are on (the `Pile` works it out from the settings and the system's wish for less motion). */
export interface Motion {
  cutIns: boolean;
  shake: boolean;
  hitStop: boolean;
}

/**
 * Runs the removals: takes the presses of 添加 and 减少 (an `ActionQueue`), deals one of
 * the removers it was given for each removal from a shuffle bag, and keeps its `Removal`
 * going on a `ScoopBoard`, drawing it over the pile. It knows removers only as `Remover`s,
 * and the pile only through the sink it sends the engine's commands to and the ground its
 * boards look at. Icons a removal drops back are watched as they fall: one that
 * falls into the bin is destroyed too, so the user can move the bin to catch them. The board
 * makes sure every icon of a removal ends up released or destroyed: when it is over, and at
 * once on `reset()`, since the engine has already let go of everything then.
 *
 * A removal's clock is the wall time less what it has spent frozen (`hitStop`, from its
 * board's `fx`): it sees the frozen time while frozen, and `isOver` the same, so a freeze-frame
 * holds it still and it carries on from there. The queue, the bin and the gaps between
 * removals keep wall time.
 */
export class RemovalDirector implements Traffic {
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
  private readonly ground: Ground;
  private readonly removers: readonly Remover[];
  /** The removers still to go in this round (see `nextRemover`), and the one that went last. */
  private bag: Remover[] = [];
  private lastRemover: Remover | null = null;
  /** The names of the removers it may deal, or null for all of them. */
  private enabled: ReadonlySet<string> | null = null;
  private motion: Motion = { cutIns: true, shake: true, hitStop: true };
  /** The wall time spent frozen in the removal under way, not counting a freeze still going. */
  private frozenMs = 0;
  /** The freeze going on now: when it began and when it lets go (wall time); null while there is none. */
  private freeze: { from: number; until: number } | null = null;
  /** When the last cut-in began, and whether the removal under way has had its own. */
  private lastCutIn = -Infinity;
  private cutInShown = false;

  constructor(
    private readonly sink: RemovalSink,
    { ground, removers, rng = Math.random }: Options,
  ) {
    this.ground = ground;
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

  /**
   * Deal only the removers named, from the next removal on; with none of them named it goes
   * on dealing from all, so a removal always has one.
   */
  setEnabled(names: ReadonlySet<string>): void {
    this.enabled = names;
    this.bag = [];
  }

  /** Which extras are on, from now on. */
  setMotion(motion: Motion): void {
    this.motion = motion;
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
    this.startClock();
    this.lastEnded = -Infinity;
    this.falling.clear();
    this.queue.reset();
  }

  /**
   * The queue's turn for a removal: deal its remover now, so it can say which icons it
   * wants, and ask the engine for them.
   */
  scoop(count: number, drop: number): void {
    this.next = this.nextRemover();
    this.sink.scoop(count, drop, this.next.shape?.(this.rng));
  }

  /** The icons the engine set aside for the next removal have arrived: it begins at wall time `now`. */
  onScoop(scoop: Scoop, world: World, now: number): void {
    this.queue.scooped();
    const remover = this.next ?? this.nextRemover();
    this.next = null;
    if (scoop.ids.length === 0) return;
    const board = new ScoopBoard(
      this.sink,
      this.ground,
      scoop,
      world,
      (id) => this.falling.set(id, this.now),
      this.makeFx(),
    );
    // The removal begins on wall time; its clock is wall time until it is frozen.
    this.startClock();
    this.cutInShown = false;
    this.run = { removal: remover.begin(board, now, this.rng), board };
  }

  /**
   * Draw the removal as of wall time `now`, ending it once it is over, catch what falls
   * into the bin, and work through the queue when nothing is under way.
   */
  draw(gfx: Gfx, now: number): void {
    this.now = now;
    this.catchFalling(now);
    const { run } = this;
    if (run) {
      const time = this.removalTime(now);
      if (run.removal.isOver(time)) {
        run.board.finish();
        this.run = null;
        this.lastEnded = now;
        this.startClock();
      } else {
        run.removal.draw(gfx, time);
      }
    }
    this.queue.tick(now);
  }

  /** The removal's clock starts over: no time frozen yet. */
  private startClock(): void {
    this.frozenMs = 0;
    this.freeze = null;
  }

  /** The time the removal sees at wall time `now`: standing still while frozen, and less what it has been frozen for after. */
  private removalTime(now: number): number {
    const { freeze } = this;
    if (freeze && now >= freeze.until) {
      this.frozenMs += freeze.until - freeze.from;
      this.freeze = null;
    }
    return (this.freeze ? this.freeze.from : now) - this.frozenMs;
  }

  /** Freeze the removal for `ms` from the frame being drawn, or longer if it is frozen already. */
  private hitStop(ms: number): void {
    if (!this.motion.hitStop || !(ms > 0)) return;
    const until = this.now + ms;
    this.freeze = this.freeze
      ? { from: this.freeze.from, until: Math.max(this.freeze.until, until) }
      : { from: this.now, until };
  }

  /** What a removal's board gives it for the showy extras, which hold to the settings at the moment it asks. */
  private makeFx(): Fx {
    return {
      shake: (amplitude, ms) => {
        if (this.motion.shake) this.ground.fx?.shake(amplitude, ms);
      },
      hitStop: (ms) => this.hitStop(ms),
      cutIn: (request) => this.cutIn(request),
    };
  }

  private cutIn(request: CutInRequest): void {
    const { motion, now } = this;
    if (!motion.cutIns || this.cutInShown || now - this.lastCutIn < CUT_IN_COOLDOWN_MS) return;
    this.cutInShown = true;
    this.lastCutIn = now;
    this.ground.fx?.cutIn(request);
    this.hitStop(request.hitStopMs ?? DEFAULT_HIT_STOP_MS);
    if (motion.shake) {
      this.ground.fx?.shake(request.shake ?? DEFAULT_CUT_IN_SHAKE, CUT_IN_SHAKE_MS);
    }
  }

  /**
   * The remover for the next removal, from a shuffle bag: every one goes once, in a random
   * order, before any goes again, so they come up as often as each other even over a few
   * removals, and the same one never goes twice running when there is a choice.
   */
  private nextRemover(): Remover {
    if (this.bag.length === 0) {
      const on = this.removers.filter((r) => this.enabled?.has(r.name) ?? true);
      const bag = on.length > 0 ? on : [...this.removers];
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
   * ones the pile hasn't seen for a while (destroyed some other way). A just-dropped icon
   * isn't in a frame until the engine has let it go, so it gets a moment to show up.
   */
  private catchFalling(now: number): void {
    if (this.falling.size === 0) return;
    const { bin } = this;
    for (const [id, since] of this.falling) {
      const at = this.ground.peek(id);
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
