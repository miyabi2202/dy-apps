import type { RemovalSink } from './sink';

/** The most icons one removal carries off; any more asked for go at once, unseen. */
export const LOAD_CAPACITY = 2000;
/** A removal takes this many times the number asked for, and drops this share of what it took (a fifth, so a quarter of the number asked for). */
const TAKE_SHARE = 1.25;
const DROP_SHARE = 0.2;
/** The next queued removal begins this long after the one before is over, so two are never under way at once. */
const QUEUE_GAP_MS = 1000;

/**
 * How a removal of `count` goes with `remaining` icons in the pile: how many it carries
 * off, how many of those it drops back, and how many go at once, over its load. It
 * takes a quarter more than asked for and drops a fifth of what it took (a quarter
 * of the number), so the pile loses at least the number, and more for each dropped icon the bin
 * catches; but with no more in the pile than asked for, it takes everything and keeps it.
 */
export function planRemoval(
  count: number,
  remaining: number,
): { carry: number; drop: number; instant: number } {
  if (count <= 0 || remaining <= 0) return { carry: 0, drop: 0, instant: 0 };
  const take = count >= remaining ? remaining : Math.min(remaining, Math.round(count * TAKE_SHARE));
  const carry = Math.min(take, LOAD_CAPACITY);
  const drop = count >= remaining ? 0 : Math.min(carry, Math.floor(take * DROP_SHARE));
  return { carry, drop, instant: take - carry };
}

/** A press waiting its turn: icons to add, or icons to remove. */
type Action = { kind: 'add'; count: number } | { kind: 'remove'; count: number };

/** Whether a removal is under way, and when the last one was over. */
export interface Traffic {
  readonly busy: boolean;
  readonly lastEnded: number;
}

/**
 * The presses of 添加 and 减少, worked through in order while no removal is under way: an
 * addition goes at once; a removal begins once the last has been over long enough, and
 * nothing more goes until it is over too. A removal's size is planned when its turn comes,
 * from the pile as it is then (see `planRemoval`), so earlier presses count. Quick
 * repeated presses thus run removals one after another, never two at once, and icons never
 * rain down through a removal.
 */
export class ActionQueue {
  private readonly queue: Action[] = [];
  /** A scoop has been asked for and its icons haven't come back in a frame yet. */
  private awaiting = false;

  constructor(
    private readonly sink: RemovalSink,
    private readonly traffic: Traffic,
  ) {}

  /** Presses waiting their turn. */
  get length(): number {
    return this.queue.length;
  }

  /** Icons asked for but still waiting on a removal to be over before they drop in. */
  get pendingAdds(): number {
    let n = 0;
    for (const action of this.queue) if (action.kind === 'add') n += action.count;
    return n;
  }

  /** Add `count` icons: at once if nothing is up, else once it is gone. */
  add(count: number, now: number): void {
    if (count <= 0) return;
    this.queue.push({ kind: 'add', count });
    this.tick(now);
  }

  /** Remove `count` icons when their turn comes. */
  remove(count: number, now: number): void {
    if (count <= 0) return;
    this.queue.push({ kind: 'remove', count });
    this.tick(now);
  }

  /** The scoop asked for has come back (even empty): the queue may move on once its removal is over. */
  scooped(): void {
    this.awaiting = false;
  }

  /** Nothing is left to do: the engine was cleared. */
  reset(): void {
    this.queue.length = 0;
    this.awaiting = false;
  }

  /** Work through the queue as far as the traffic allows, at wall time `now`. */
  tick(now: number): void {
    while (!this.awaiting && !this.traffic.busy) {
      const next = this.queue[0];
      if (!next) return;
      if (next.kind === 'add') {
        this.queue.shift();
        this.sink.add(next.count);
        continue;
      }
      if (now - this.traffic.lastEnded < QUEUE_GAP_MS) return;
      this.queue.shift();
      const { carry, drop, instant } = planRemoval(next.count, this.sink.alive());
      if (instant > 0) this.sink.remove(instant);
      if (carry === 0) continue;
      this.awaiting = true;
      this.sink.scoop(carry, drop);
    }
  }
}
