import type { PileSettings } from '../core/config';
import type { Frame } from '../core/protocol';

type Settings = Pick<PileSettings, 'radius' | 'grabRadius'>;

/** Where an icon is, and whether it is at rest. */
export interface Placed {
  x: number;
  y: number;
  resting: boolean;
}

/** How many numbers each removal takes in `ChangeJournal.removed`. */
export const REMOVED_STRIDE = 5;

/**
 * What has happened to the resting set since the renderer last looked, for it to keep its
 * layer in step without comparing the whole set. Settled icons are not recorded: they are
 * appended to the resting arrays, and the renderer finds them past its watermark. A removal
 * is, as the slot it left, the last slot at the time, the icon that moved from the last slot
 * to fill it, and where the removed icon was, since the arrays no longer say.
 */
export class ChangeJournal {
  /** The pile was started over: whatever came before is moot. */
  reset = false;
  /** The removals in order, `REMOVED_STRIDE` numbers each: slot, last, lastId, x, y. */
  readonly removed: number[] = [];

  get isEmpty(): boolean {
    return !this.reset && this.removed.length === 0;
  }

  clear(): void {
    this.reset = false;
    this.removed.length = 0;
  }
}

interface Options {
  /** The canvas's size until the first frame says otherwise. */
  world: { width: number; height: number };
  /** For how long, in ms, a moving icon has to have been moving to count as part of the heap (see `highestTop`). */
  heapAgeMs: number;
  /** How far below the drop line, in pixels, the stream just released reaches: a young mover is part of the heap only below it. */
  releaseBand: number;
  /** A young mover slower than this (px/s) has landed; the stream falls faster. */
  landedSpeed: number;
}

/**
 * Where every icon is, as the worker's frames say, and nothing about how it is drawn:
 * the resting icons in order of settling (typed arrays, with each icon's slot), the latest
 * two frames for interpolating the moving ones, and what is asked of them: where one is
 * (`peek`), taking one out (`take`), the top of the pile (`topAt`, `profile`, `highestTop`)
 * and which one is under a point (`iconAt`).
 *
 * The renderer's resting layer follows the resting set a frame at a time, from the
 * `journal` of what left it.
 */
export class PileState {
  readonly journal = new ChangeJournal();
  /** The canvas's size, as of the latest frame. */
  world: { width: number; height: number };
  /** The latest frame's generation; goes up when the engine starts the pile over. */
  generation = -1;
  /** The latest two frames, for interpolation; `prevAt` maps an icon to its place in `prev`. */
  cur: Frame | null = null;
  prev: Frame | null = null;
  /** The wall time the latest frame arrived. */
  curArrived = 0;
  readonly prevAt = new Map<number, number>();
  private readonly curAt = new Map<number, number>();

  // Every resting icon, in order of settling: index and position, and each icon's slot.
  private ids = new Int32Array(4096);
  private xy = new Float32Array(8192);
  private count = 0;
  private readonly slots = new Map<number, number>();
  /** The highest resting icon's y, or Infinity; stale once the one that held it has gone. */
  private restingTop = Infinity;
  private restingTopStale = false;
  /** When each icon last began moving, in the frames' time, by index. */
  private bornAt = new Float64Array(4096);
  /** The top of the pile in columns two radii wide (Infinity where there is none), built when asked and dropped when the pile changes. */
  private tops: Float32Array | null = null;
  /** `highestTop` for `heapLine`, until the pile changes; undefined while not worked out. */
  private heapTop: number | null | undefined;
  private heapLine: number | null = null;
  private readonly options: Options;

  constructor(
    private readonly settings: Settings,
    options: Options,
  ) {
    this.world = options.world;
    this.options = options;
  }

  /** How many icons are at rest. */
  get restingCount(): number {
    return this.count;
  }

  /** The resting icons' x, y pairs, by slot; read afresh each time, since they are reallocated as the pile grows. */
  get restingXy(): Float32Array {
    return this.xy;
  }

  /** The slot of resting icon `id`, or undefined if it isn't at rest. */
  slotOf(id: number): number | undefined {
    return this.slots.get(id);
  }

  /** Whether `frame` starts the pile over, as the first one does. */
  isNewGeneration(frame: Frame): boolean {
    return frame.generation !== this.generation;
  }

  /** Take in a frame from the worker, received at wall time `now` (ms). */
  apply(frame: Frame, now: number): void {
    this.tops = null;
    this.heapTop = undefined;
    if (frame.width !== this.world.width || frame.height !== this.world.height) {
      this.world = { width: frame.width, height: frame.height };
    }
    if (this.isNewGeneration(frame)) {
      this.generation = frame.generation;
      this.count = 0;
      this.slots.clear();
      this.restingTop = Infinity;
      this.restingTopStale = false;
      this.prev = null;
      this.journal.clear();
      this.journal.reset = true;
    } else {
      this.prev = this.cur;
    }
    this.prevAt.clear();
    if (this.prev) this.prev.movingIds.forEach((id, k) => this.prevAt.set(id, k));
    this.curAt.clear();
    const { movingIds } = frame;
    for (let k = 0; k < movingIds.length; k++) {
      const id = movingIds[k]!;
      this.curAt.set(id, k);
      // One that wasn't moving a frame ago has only just begun (released, or woken).
      if (!this.prevAt.has(id)) {
        if (id >= this.bornAt.length) this.growBorn(id);
        this.bornAt[id] = frame.time;
      }
    }
    this.cur = frame;
    this.curArrived = now;

    // Settled before woken: an icon can do both within one tick (a cascade wakes one that
    // has just come to rest), and must end up off the pile.
    const need = this.count + frame.settledIds.length;
    if (need > this.ids.length) {
      const size = Math.max(need, this.ids.length * 2);
      const ids = new Int32Array(size);
      ids.set(this.ids);
      this.ids = ids;
      const xy = new Float32Array(size * 2);
      xy.set(this.xy);
      this.xy = xy;
    }
    frame.settledIds.forEach((id, k) => this.slots.set(id, this.count + k));
    this.ids.set(frame.settledIds, this.count);
    this.xy.set(frame.settledXy, this.count * 2);
    this.count += frame.settledIds.length;
    for (let k = 0; k < frame.settledIds.length; k++) {
      this.restingTop = Math.min(this.restingTop, frame.settledXy[2 * k + 1]!);
    }
    frame.wokenIds.forEach((id) => this.removeResting(id));
  }

  /** Where icon `id` is, at rest or as of the latest frame; null if it isn't here. */
  peek(id: number): Placed | null {
    const slot = this.slots.get(id);
    if (slot !== undefined) {
      return { x: this.xy[2 * slot]!, y: this.xy[2 * slot + 1]!, resting: true };
    }
    const k = this.curAt.get(id);
    const { cur } = this;
    if (cur && k !== undefined) {
      return { x: cur.movingXy[2 * k]!, y: cur.movingXy[2 * k + 1]!, resting: false };
    }
    return null;
  }

  /**
   * Icon `id` is taken: where it is now, and out of the resting set if it was there (the
   * engine's frame will say the same a tick later). Null if it isn't here.
   */
  take(id: number): { x: number; y: number } | null {
    const at = this.peek(id);
    if (at?.resting) this.removeResting(id);
    this.tops = null;
    this.heapTop = undefined;
    return at;
  }

  /**
   * The top of the pile at world x: the middle of the highest icon, resting or moving, in
   * its column or the one either side; null if there are none there.
   */
  topAt(x: number): number | null {
    const tops = this.profile();
    const width = 2 * this.settings.radius;
    const c = Math.floor(x / width);
    let best = Infinity;
    for (let j = Math.max(0, c - 1); j <= Math.min(tops.length - 1, c + 1); j++)
      best = Math.min(best, tops[j]!);
    return Number.isFinite(best) ? best : null;
  }

  /**
   * The top of the pile in each column two radii wide, left to right (Infinity where there
   * is none), resting and moving icons alike. Not to be changed, and good until the pile does.
   */
  profile(): Float32Array {
    if (this.tops) return this.tops;
    const width = 2 * this.settings.radius;
    const tops = new Float32Array(Math.ceil(this.world.width / width) + 2).fill(Infinity);
    const add = (px: number, py: number) => {
      const c = Math.min(tops.length - 1, Math.max(0, Math.floor(px / width)));
      if (py < tops[c]!) tops[c] = py;
    };
    for (let k = 0; k < this.count; k++) add(this.xy[2 * k]!, this.xy[2 * k + 1]!);
    const { cur } = this;
    if (cur)
      for (let k = 0; k < cur.movingIds.length; k++)
        add(cur.movingXy[2 * k]!, cur.movingXy[2 * k + 1]!);
    this.tops = tops;
    return tops;
  }

  /**
   * The highest point of the heap, by the middle of its highest icon: what rests, what has
   * been moving for `heapAgeMs` or more, and what has landed on the heap and is still settling
   * (moving slowly, and below the stream's reach under the drop line `dropLine`). The stream
   * just released doesn't count, so what keeps clear of the pile never chases what it has
   * just let in. Null if there is none.
   */
  highestTop(dropLine: number | null): number | null {
    if (this.heapTop !== undefined && this.heapLine === dropLine) return this.heapTop;
    if (this.restingTopStale) {
      let top = Infinity;
      for (let k = 0; k < this.count; k++) top = Math.min(top, this.xy[2 * k + 1]!);
      this.restingTop = top;
      this.restingTopStale = false;
    }
    let top = this.restingTop;
    const { cur, prev, prevAt } = this;
    const { heapAgeMs, releaseBand, landedSpeed } = this.options;
    if (cur) {
      const below = (dropLine ?? -Infinity) + releaseBand;
      const dt = prev ? Math.max(1, cur.time - prev.time) / 1000 : 0;
      for (let k = 0; k < cur.movingIds.length; k++) {
        const y = cur.movingXy[2 * k + 1]!;
        if (y >= top) continue;
        const id = cur.movingIds[k]!;
        let counts = cur.time - this.bornAt[id]! >= heapAgeMs;
        const before = prev ? prevAt.get(id) : undefined;
        if (!counts && prev && before !== undefined && y > below) {
          const dx = cur.movingXy[2 * k]! - prev.movingXy[2 * before]!;
          const dy = y - prev.movingXy[2 * before + 1]!;
          counts = Math.hypot(dx, dy) / dt < landedSpeed;
        }
        if (counts) top = y;
      }
    }
    this.heapLine = dropLine;
    this.heapTop = Number.isFinite(top) ? top : null;
    return this.heapTop;
  }

  /**
   * The icon to pick up at world position (x, y), if any: the nearest within `grabRadius`,
   * a moving one first (they are drawn on top), else a resting one; none that `skip` says
   * to leave.
   */
  iconAt(x: number, y: number, skip?: (id: number) => boolean): number | null {
    const r = this.settings.grabRadius;
    let best: number | null = null;
    let bestD2 = r * r;
    const { cur } = this;
    if (cur) {
      for (let k = 0; k < cur.movingIds.length; k++) {
        const dx = cur.movingXy[2 * k]! - x;
        const dy = cur.movingXy[2 * k + 1]! - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2 && !skip?.(cur.movingIds[k]!)) {
          bestD2 = d2;
          best = cur.movingIds[k]!;
        }
      }
      if (best !== null) return best;
    }
    for (let k = 0; k < this.count; k++) {
      const dx = this.xy[2 * k]! - x;
      const dy = this.xy[2 * k + 1]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2 && !skip?.(this.ids[k]!)) {
        bestD2 = d2;
        best = this.ids[k]!;
      }
    }
    return best;
  }

  /** Icon `id` is no longer at rest: out of the list, and into the journal. */
  private removeResting(id: number): void {
    const slot = this.slots.get(id);
    if (slot === undefined) return;
    const x = this.xy[2 * slot]!;
    const y = this.xy[2 * slot + 1]!;
    // Fill the slot with the last icon.
    const last = this.count - 1;
    let lastId = -1;
    if (slot !== last) {
      lastId = this.ids[last]!;
      this.ids[slot] = lastId;
      this.xy[2 * slot] = this.xy[2 * last]!;
      this.xy[2 * slot + 1] = this.xy[2 * last + 1]!;
      this.slots.set(lastId, slot);
    }
    this.slots.delete(id);
    this.count = last;
    if (y <= this.restingTop) this.restingTopStale = true;
    this.journal.removed.push(slot, last, lastId, x, y);
  }

  private growBorn(id: number): void {
    const born = new Float64Array(Math.max(id + 1, this.bornAt.length * 2));
    born.set(this.bornAt);
    this.bornAt = born;
  }
}
