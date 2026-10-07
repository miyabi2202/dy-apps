import type { FlightSink } from './sink';

/** The most icons one craft carries; any more asked for go at once, without a flight. */
export const VACUUM_CAPACITY = 2000;
/** The vacuum takes this many times the number asked for, and drops this share of what it took. */
const TAKE_SHARE = 1.25;
const DROP_SHARE = 0.5;
/** The next queued craft sets off this long after the one before is gone, so two are never up at once. */
const QUEUE_GAP_MS = 1000;

/**
 * How a removal of `count` goes with `remaining` icons in the pile: how many the craft
 * flies, how many of those it drops back, and how many go at once, over a craft's load.
 * The vacuum takes a quarter more than asked for and drops half of what it took, so the
 * pile loses at least five eighths of the number, and more for each dropped icon the bin
 * catches; but with no more in the pile than asked for, it takes everything and keeps it.
 */
export function planRemoval(
  count: number,
  remaining: number,
): { fly: number; drop: number; instant: number } {
  if (count <= 0 || remaining <= 0) return { fly: 0, drop: 0, instant: 0 };
  const take = count >= remaining ? remaining : Math.min(remaining, Math.round(count * TAKE_SHARE));
  const fly = Math.min(take, VACUUM_CAPACITY);
  const drop = count >= remaining ? 0 : Math.min(fly, Math.floor(take * DROP_SHARE));
  return { fly, drop, instant: take - fly };
}

/** A press waiting its turn: icons to add, or icons to remove. */
type Action = { kind: 'add'; count: number } | { kind: 'remove'; count: number };

/** Whether a craft is up, and when the last one was gone. */
export interface Traffic {
  readonly busy: boolean;
  readonly lastEnded: number;
}

/**
 * The presses of 添加 and 减少, worked through in order while no craft is up: an addition
 * goes at once; a removal's craft sets off once the last has been gone long enough, and
 * nothing more goes until that craft is gone too. A removal's size is planned when its
 * turn comes, from the pile as it is then (see `planRemoval`), so earlier presses count.
 * Quick repeated presses thus send crafts one after another, never two at once, and icons
 * never rain down through a removal.
 */
export class ActionQueue {
  private readonly queue: Action[] = [];
  /** A scoop has been asked for and its icons haven't come back in a frame yet. */
  private awaiting = false;

  constructor(
    private readonly sink: FlightSink,
    private readonly traffic: Traffic,
  ) {}

  /** Presses waiting their turn. */
  get length(): number {
    return this.queue.length;
  }

  /** Icons asked for but still waiting on a craft to be gone before they drop in. */
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

  /** The scoop asked for has come back (even empty): the queue may move on once the craft is gone. */
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
      const { fly, drop, instant } = planRemoval(next.count, this.sink.alive());
      if (instant > 0) this.sink.remove(instant);
      if (fly === 0) continue;
      this.awaiting = true;
      this.sink.scoop(fly, drop);
    }
  }
}
