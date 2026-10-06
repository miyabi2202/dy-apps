import { PILE, type PileSettings } from './config';

/** Random numbers in [0, 1); `Math.random` unless a test passes its own. */
export type Rng = () => number;

interface Options {
  settings?: PileSettings;
  rng?: Rng;
}

/** How many of the latest releases a new one is kept clear of (far more than are still near the line). */
const RECENT = 256;
/** Tries to find a clear spot for a new icon before leaving it queued for the next step. */
const SPAWN_TRIES = 10;

/**
 * The pile: every icon is a circle in a world with a floor. New icons fall straight down
 * from above; the moment one touches the floor or a resting icon it stops dead, right where
 * it touched, and is part of the pile from then on. Falling icons never meet each other:
 * every one is released on the same line (just above the pile, which only ever rises) at
 * the same speed, clear of the ones released just before, so anything below it is always
 * faster. A step therefore costs by how many are in the air, not by the size of the pile.
 *
 * All state lives in typed arrays indexed by icon, sized for `maxItems` up front. Resting
 * icons sit in a grid of linked lists, `2 × radius` square cells, so a falling icon only has
 * to look at the cells its step crosses. The step is swept, not sampled: the first touch
 * along the way down is where the icon stops, so a fast one never passes through the pile.
 */
export class PileWorld {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly maxItems: number;

  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Downward speed; 0 once at rest. */
  readonly vy: Float32Array;
  /** 1 once an icon has come to rest. */
  readonly resting: Uint8Array;

  /** Icons in the world so far (indices `0 … count - 1`). */
  count = 0;
  /** Asked for but not yet released. */
  queued = 0;
  /** The top of the resting pile: the highest resting icon's centre, or the floor. */
  topY: number;
  /** Goes up on every `clear()`, so a renderer knows to start its pile over. */
  generation = 0;

  private readonly settings: PileSettings;
  private readonly rng: Rng;

  // Falling icons, in no particular order.
  private readonly awake: Int32Array;
  private awakeLen = 0;
  private spawnCredit = 0;
  private readonly recent = new Int32Array(RECENT).fill(-1);
  private recentAt = 0;

  // The grid of resting icons. `cellOf` turns a position into a cell; rows above the world
  // hold the pile once it grows past the top, and everything higher still lands in row 0.
  private readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly gridTop: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;

  // Icons that came to rest since the last drain, for the renderer's static layer.
  private readonly settledBuf: Int32Array;
  private settledLen = 0;

  constructor({ settings = PILE, rng = Math.random }: Options = {}) {
    this.settings = settings;
    this.rng = rng;
    this.width = settings.world.width;
    this.height = settings.world.height;
    this.radius = settings.radius;
    this.maxItems = settings.maxItems;
    this.topY = this.height;

    const n = this.maxItems;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.resting = new Uint8Array(n);
    this.awake = new Int32Array(n);
    this.settledBuf = new Int32Array(n);

    this.cellSize = this.radius * 2;
    this.cols = Math.max(1, Math.ceil(this.width / this.cellSize));
    const visibleRows = Math.ceil(this.height / this.cellSize);
    // Room for the whole pile above the top. Icons that stop on first touch stack loosely,
    // at roughly a third of close packing, so allow three times that height.
    const pileRows = Math.ceil((3 * n) / this.cols);
    this.rows = visibleRows + pileRows;
    this.gridTop = -pileRows * this.cellSize;
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = new Int32Array(n);
  }

  /** Icons still in the air. */
  get fallingCount(): number {
    return this.awakeLen;
  }

  /** Queue `n` more icons; they're released over the next steps. Returns how many fit. */
  add(n: number): number {
    const room = this.maxItems - this.count - this.queued;
    const added = Math.max(0, Math.min(Math.floor(n), room));
    this.queued += added;
    return added;
  }

  /** Back to an empty world. */
  clear(): void {
    this.count = 0;
    this.queued = 0;
    this.awakeLen = 0;
    this.settledLen = 0;
    this.spawnCredit = 0;
    this.topY = this.height;
    this.head.fill(-1);
    this.recent.fill(-1);
    this.resting.fill(0);
    this.generation++;
  }

  /** Hands over every icon that came to rest since the last call. */
  drainSettled(fn: (index: number) => void): void {
    for (let k = 0; k < this.settledLen; k++) fn(this.settledBuf[k]!);
    this.settledLen = 0;
  }

  /** Calls `fn` for each falling icon. */
  forEachFalling(fn: (index: number) => void): void {
    for (let k = 0; k < this.awakeLen; k++) fn(this.awake[k]!);
  }

  /** Advance by `dt` seconds. Meant for a small fixed step (see `FRAME`). */
  step(dt: number): void {
    this.spawn(dt);
    this.fall(dt);
  }

  /** Release what the rate allows, each on the line, clear of the ones released just before. */
  private spawn(dt: number): void {
    const s = this.settings;
    this.spawnCredit += s.spawnPerSecond * dt;
    const n = Math.min(Math.floor(this.spawnCredit), this.queued, this.maxItems - this.count);
    if (n <= 0) return;
    const r = this.radius;
    const d2 = 4 * r * r;
    // Just above the top edge, or above the pile once it has grown past it.
    const py = Math.min(-r, this.topY - 2 * r);
    let released = 0;
    while (released < n) {
      let px = 0;
      let clear = false;
      for (let attempt = 0; attempt < SPAWN_TRIES && !clear; attempt++) {
        px = r + this.rng() * (this.width - 2 * r);
        clear = true;
        for (let k = 0; k < RECENT; k++) {
          const j = this.recent[k]!;
          if (j === -1) continue;
          const dx = px - this.x[j]!;
          const dy = py - this.y[j]!;
          if (dx * dx + dy * dy < d2) {
            clear = false;
            break;
          }
        }
      }
      // The band is crowded: leave the rest queued for the next step.
      if (!clear) break;
      const i = this.count++;
      this.x[i] = px;
      this.y[i] = py;
      this.vy[i] = s.spawnSpeed;
      this.resting[i] = 0;
      this.awake[this.awakeLen++] = i;
      this.recent[this.recentAt] = i;
      this.recentAt = (this.recentAt + 1) % RECENT;
      released++;
    }
    this.spawnCredit -= released;
    this.queued -= released;
  }

  private cellOf(px: number, py: number): number {
    return this.rowOf(py) * this.cols + this.colOf(px);
  }

  private colOf(px: number): number {
    const col = Math.floor(px / this.cellSize);
    return col < 0 ? 0 : col >= this.cols ? this.cols - 1 : col;
  }

  private rowOf(py: number): number {
    const row = Math.floor((py - this.gridTop) / this.cellSize);
    return row < 0 ? 0 : row >= this.rows ? this.rows - 1 : row;
  }

  /**
   * Move each falling icon down by one step. The way down is checked against the floor and
   * the resting icons in the cells it crosses; the icon stops at the first one it would
   * touch, exactly touching, and rests there.
   *
   * Icons go in release order, which is lowest first, so one that stops this step is in the
   * grid before anything above it moves. The other way round, the upper one could move past
   * the point where the lower one then stopped, and fall through it next step.
   */
  private fall(dt: number): void {
    const { x, y, vy, awake, head, next, cols } = this;
    const r = this.radius;
    const d = 2 * r;
    const d2 = d * d;
    const floor = this.height - r;
    const g = this.settings.gravity * dt;

    let kept = 0;
    for (let k = 0; k < this.awakeLen; k++) {
      const i = awake[k]!;
      const px = x[i]!;
      const y0 = y[i]!;
      vy[i]! += g;
      const y1 = y0 + vy[i]! * dt;

      // Where it would stop: the floor, or the first resting icon it would touch.
      let stopY = floor;
      const c0 = this.colOf(px - d);
      const c1 = this.colOf(px + d);
      const r0 = this.rowOf(y0 - d);
      const r1 = this.rowOf(y1 + d);
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          for (let j = head[row * cols + col]!; j !== -1; j = next[j]!) {
            const dx = px - x[j]!;
            const dx2 = dx * dx;
            if (dx2 >= d2) continue;
            const touchY = y[j]! - Math.sqrt(d2 - dx2);
            // Already past its shoulder (beside or below it): not in the way.
            if (touchY < y0) continue;
            if (touchY < stopY) stopY = touchY;
          }
        }
      }

      if (y1 < stopY) {
        y[i] = y1;
        awake[kept++] = i;
        continue;
      }
      this.stop(i, stopY);
    }
    this.awakeLen = kept;
  }

  /** Put icon `i` to rest at height `py`: into the grid, out of the air. */
  private stop(i: number, py: number): void {
    this.y[i] = py;
    this.vy[i] = 0;
    this.resting[i] = 1;
    const c = this.cellOf(this.x[i]!, py);
    this.next[i] = this.head[c]!;
    this.head[c] = i;
    if (py < this.topY) this.topY = py;
    this.settledBuf[this.settledLen++] = i;
  }
}
