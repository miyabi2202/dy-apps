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
/** An icon this close to a surface counts as touching it. */
const TOUCH = 0.5;
/**
 * A support an icon was touching pulls it back from this far: sliding along a circle in
 * straight steps drifts outward by `step² / (2 × diameter)`, up to 2 px at 1000 px/s.
 */
const SNAP = 2;
/** Deeper into another icon than this is an overlap to push out of, not a touch. */
const OVERLAP = 0.05;
/** A move is along a contact's surface when it goes into or away from it less than this. */
const ALONG = 0.05;
/** The most contacts one icon keeps track of in a step. */
const MAX_CONTACTS = 16;
/** A direction this far into a contact (per unit of movement) still counts as along it. */
const FEASIBLE = 1e-3;
/** A direction has to go down at least this much (per unit of movement) to count as downhill. */
const DOWNHILL = 1e-3;
/** A single support this close to straight below is a balancing point, not a resting place. */
const APEX = 0.02;
/** An icon that stays within this of one spot is still, however it jitters inside that. */
const STILL = 0.5;
/** Still for this many steps: a moving icon counts as holding up the ones resting on it. */
const HOLD_STEPS = 3;
/**
 * Still for this many steps on the pile, and not waiting behind a moving icon: wedged,
 * whatever the geometry says (straight-step sliding can chatter in a tight notch forever).
 */
const STALL_STEPS = 20;
/** Still for this many steps whatever it is waiting behind: rest, to break a stand-off. */
const DEADLOCK_STEPS = 60;

/** What an icon is touching: other icons by index, or one of the walls or the floor. */
const FLOOR = -1;
const WALL = -2;

/**
 * The pile: every icon is a circle in a world with a floor and two walls. New icons fall
 * straight down from above. Touching anything kills an icon's motion, but gravity keeps
 * pulling: while there is a way downhill along what it touches, it slides that way, picking
 * up speed, and loses that speed again the moment it meets something new. Only when nothing
 * it touches lets it move down any further, on the floor or held between supports, does it
 * come to rest and join the pile.
 *
 * Every icon is in every other's way, but a sliding icon never holds another up: one sitting
 * on it just waits, blocked, until it has been still for a few steps. Icons are stepped
 * lowest first, so what an icon could be held by is settled before the icon itself, and two
 * icons leaning on each other come to rest together. An icon that chatters in one spot for
 * long enough is taken to be wedged and rests too. A step costs by how many icons are
 * moving, not by the size of the pile.
 *
 * All state lives in typed arrays indexed by icon, sized for `maxItems` up front. Resting
 * icons sit in a grid of linked lists, `2 × radius` square cells, and moving icons in a
 * second one rebuilt each step, so an icon only has to look at the cells around it and along
 * its step. The step is swept, not sampled: the first touch along the way is where the icon
 * stops, so a fast one never passes through anything.
 */
export class PileWorld {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly maxItems: number;

  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Speed along the icon's current way down; 0 once at rest. */
  readonly speed: Float32Array;
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

  // Moving icons, sorted lowest first at each step.
  private readonly awake: Int32Array;
  private awakeLen = 0;
  /** Steps a moving icon has stayed within `STILL` of its anchor, capped at 255. */
  private readonly still: Uint8Array;
  private readonly anchorX: Float32Array;
  private readonly anchorY: Float32Array;
  /** 1 for a moving icon whose last sweep was cut short by another moving icon. */
  private readonly waiting: Uint8Array;
  private spawnCredit = 0;
  private readonly recent = new Int32Array(RECENT).fill(-1);
  private recentAt = 0;

  // The grids. `cellOf` turns a position into a cell; rows above the world hold the pile
  // once it grows past the top, and everything higher still lands in row 0. The resting
  // grid only ever gains icons; the moving grid is rebuilt from the moving list each step.
  private readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly gridTop: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  private readonly movingHead: Int32Array;
  private readonly movingNext: Int32Array;
  private readonly movingCells: Int32Array;
  private movingCellCount = 0;

  // The contacts of the icon being moved: the resting things it touches and the unit normal
  // from each to the icon, which is the direction that thing can push it.
  private readonly contactOf = new Int32Array(MAX_CONTACTS);
  private readonly contactNx = new Float64Array(MAX_CONTACTS);
  private readonly contactNy = new Float64Array(MAX_CONTACTS);
  private contacts = 0;
  private overlapping = false;
  // The way down found by `wayDown`, as a unit vector.
  private wayX = 0;
  private wayY = 0;
  // Whether the last `sweep` was cut short by a moving icon rather than a resting one.
  private blockedByMover = false;

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
    this.speed = new Float32Array(n);
    this.resting = new Uint8Array(n);
    this.awake = new Int32Array(n);
    this.still = new Uint8Array(n);
    this.anchorX = new Float32Array(n);
    this.anchorY = new Float32Array(n);
    this.waiting = new Uint8Array(n);
    this.settledBuf = new Int32Array(n);

    this.cellSize = this.radius * 2;
    this.cols = Math.max(1, Math.ceil(this.width / this.cellSize));
    const visibleRows = Math.ceil(this.height / this.cellSize);
    // Room for the whole pile above the top: a settled pile is close to packed, so half
    // again the height of a hex-packed one is plenty.
    const pileRows = Math.ceil((1.5 * n) / this.cols);
    this.rows = visibleRows + pileRows;
    this.gridTop = -pileRows * this.cellSize;
    const cells = this.cols * this.rows;
    this.head = new Int32Array(cells).fill(-1);
    this.next = new Int32Array(n);
    this.movingHead = new Int32Array(cells).fill(-1);
    this.movingNext = new Int32Array(n);
    this.movingCells = new Int32Array(n);
  }

  /** Icons still moving. */
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
    this.clearMovingGrid();
    this.recent.fill(-1);
    this.resting.fill(0);
    this.generation++;
  }

  /** Hands over every icon that came to rest since the last call. */
  drainSettled(fn: (index: number) => void): void {
    for (let k = 0; k < this.settledLen; k++) fn(this.settledBuf[k]!);
    this.settledLen = 0;
  }

  /** Calls `fn` for each moving icon. */
  forEachFalling(fn: (index: number) => void): void {
    for (let k = 0; k < this.awakeLen; k++) fn(this.awake[k]!);
  }

  /** Advance by `dt` seconds. Meant for a small fixed step (see `FRAME`). */
  step(dt: number): void {
    this.spawn(dt);
    // Lowest first: whatever an icon could be held by is dealt with before the icon itself.
    const { y } = this;
    this.awake.subarray(0, this.awakeLen).sort((a, b) => y[b]! - y[a]!);
    this.buildMovingGrid();
    this.move(dt);
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
      // The line is crowded: leave the rest queued for the next step.
      if (!clear) break;
      const i = this.count++;
      this.x[i] = px;
      this.y[i] = py;
      this.speed[i] = s.spawnSpeed;
      this.resting[i] = 0;
      this.still[i] = 0;
      this.anchorX[i] = px;
      this.anchorY[i] = py;
      this.waiting[i] = 0;
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

  /** Where every moving icon is at the start of the step. */
  private buildMovingGrid(): void {
    this.clearMovingGrid();
    const { awake, movingHead, movingNext, movingCells } = this;
    for (let k = 0; k < this.awakeLen; k++) {
      const i = awake[k]!;
      const c = this.cellOf(this.x[i]!, this.y[i]!);
      if (movingHead[c] === -1) movingCells[this.movingCellCount++] = c;
      movingNext[i] = movingHead[c]!;
      movingHead[c] = i;
    }
  }

  private clearMovingGrid(): void {
    for (let k = 0; k < this.movingCellCount; k++) this.movingHead[this.movingCells[k]!] = -1;
    this.movingCellCount = 0;
  }

  /**
   * Move each moving icon by one step: find what holds it, pick its way down (or rest if
   * there is none), speed up under gravity, sweep that far and stop at the first new thing
   * it meets, then settle exactly onto what it was already touching.
   *
   * Icons go lowest first, so one that rests this step is in the grid before anything above
   * it moves. The other way round, the upper one could move past the point where the lower
   * one then stopped, and fall through it next step.
   */
  private move(dt: number): void {
    const { x, y, speed, still, anchorX, anchorY, waiting, awake } = this;
    const { gravity, maxSpeed, nudge } = this.settings;

    let kept = 0;
    for (let k = 0; k < this.awakeLen; k++) {
      const i = awake[k]!;
      const px = x[i]!;
      const py = y[i]!;

      this.findContacts(i, px, py);
      let dirX = 0;
      let dirY = 1;
      if (this.contacts > 0 && !this.overlapping) {
        const way = this.wayDown();
        const wedged = still[i]! >= (waiting[i] ? DEADLOCK_STEPS : STALL_STEPS);
        if (way === 0 || wedged) {
          // Nothing it touches lets it move down (or it has stopped making progress): at rest.
          this.stop(i, px, py);
          continue;
        }
        if (way === 2) {
          // Balanced on the very top of one icon: start it sliding off.
          dirX = this.contactNx[0]! > 0 || (this.contactNx[0] === 0 && this.rng() < 0.5) ? 1 : -1;
          dirY = 0;
          if (speed[i]! < nudge) speed[i] = nudge;
        } else {
          dirX = this.wayX;
          dirY = this.wayY;
        }
      }

      // Gravity along the way down, then the step's move.
      const v = Math.min(maxSpeed, speed[i]! + gravity * dirY * dt);
      const mx = dirX * v * dt;
      const my = dirY * v * dt;
      const t = this.sweep(i, px, py, mx, my);
      // Met something new: touching kills the motion.
      speed[i] = t < 1 ? 0 : v;
      this.settleOnto(i, px + mx * t, py + my * t, dirX, dirY);

      // Still counts from the last spot it clearly left, so jitter around one spot adds up.
      const dx = x[i]! - anchorX[i]!;
      const dy = y[i]! - anchorY[i]!;
      if (dx * dx + dy * dy < STILL * STILL) {
        if (still[i]! < 255) still[i]!++;
      } else {
        still[i] = 0;
        anchorX[i] = x[i]!;
        anchorY[i] = y[i]!;
      }
      waiting[i] = this.blockedByMover ? 1 : 0;
      awake[kept++] = i;
    }
    this.awakeLen = kept;
  }

  /**
   * What holds icon `i` at (px, py): the resting icons, floor and walls it touches, and any
   * moving icon under it that is itself held or blocked (still for a few steps). A sliding
   * icon never counts, so nothing rests on something about to leave.
   */
  private findContacts(i: number, px: number, py: number): void {
    const { x, y, head, next, movingHead, movingNext, still, cols } = this;
    const r = this.radius;
    const d = 2 * r;
    const near2 = (d + TOUCH) * (d + TOUCH);
    const overlap = d - OVERLAP;
    let n = 0;
    this.overlapping = false;

    if (py >= this.height - r - TOUCH) {
      this.contactOf[n] = FLOOR;
      this.contactNx[n] = 0;
      this.contactNy[n] = -1;
      n++;
    }
    if (px <= r + TOUCH) {
      this.contactOf[n] = WALL;
      this.contactNx[n] = 1;
      this.contactNy[n] = 0;
      n++;
    } else if (px >= this.width - r - TOUCH) {
      this.contactOf[n] = WALL;
      this.contactNx[n] = -1;
      this.contactNy[n] = 0;
      n++;
    }

    const cell = this.cellOf(px, py);
    const lastCell = cols * this.rows;
    for (let dr = -cols; dr <= cols && n < MAX_CONTACTS; dr += cols) {
      for (let dc = -1; dc <= 1 && n < MAX_CONTACTS; dc++) {
        const c = cell + dr + dc;
        if (c < 0 || c >= lastCell) continue;
        for (let j = head[c]!; j !== -1 && n < MAX_CONTACTS; j = next[j]!) {
          const dx = px - x[j]!;
          const dy = py - y[j]!;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > near2) continue;
          const dist = Math.sqrt(dist2);
          if (dist < overlap) this.overlapping = true;
          this.contactOf[n] = j;
          if (dist > 1e-6) {
            this.contactNx[n] = dx / dist;
            this.contactNy[n] = dy / dist;
          } else {
            this.contactNx[n] = 0;
            this.contactNy[n] = -1;
          }
          n++;
        }
      }
    }

    // Moving icons may have left their cell this step, so look one cell further out.
    for (let dr = -2 * cols; dr <= 2 * cols && n < MAX_CONTACTS; dr += cols) {
      for (let dc = -2; dc <= 2 && n < MAX_CONTACTS; dc++) {
        const c = cell + dr + dc;
        if (c < 0 || c >= lastCell) continue;
        for (let j = movingHead[c]!; j !== -1 && n < MAX_CONTACTS; j = movingNext[j]!) {
          if (j === i) continue;
          const dx = px - x[j]!;
          const dy = py - y[j]!;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > near2) continue;
          const dist = Math.sqrt(dist2);
          // One below it that is itself held holds it up; one it overlaps has to be got
          // out of, whatever it is doing.
          const holds = still[j]! >= HOLD_STEPS && dy < 0;
          if (dist < overlap) this.overlapping = true;
          else if (!holds) continue;
          this.contactOf[n] = j;
          if (dist > 1e-6) {
            this.contactNx[n] = dx / dist;
            this.contactNy[n] = dy / dist;
          } else {
            this.contactNx[n] = 0;
            this.contactNy[n] = -1;
          }
          n++;
        }
      }
    }
    this.contacts = n;
  }

  /**
   * The steepest way down that none of the contacts blocks: straight down if nothing is
   * underneath, otherwise along the surface of a contact. Returns 1 with the direction in
   * `wayX`/`wayY`, 0 when there is none (the icon is held), or 2 when the icon is balanced
   * on the top of a single icon, where no direction is downhill yet it cannot stay.
   */
  private wayDown(): 0 | 1 | 2 {
    const { contactOf, contactNx, contactNy, contacts } = this;
    if (this.allows(0, 1)) {
      this.wayX = 0;
      this.wayY = 1;
      return 1;
    }
    let best = DOWNHILL;
    let found = false;
    for (let c = 0; c < contacts; c++) {
      const nx = contactNx[c]!;
      const ny = contactNy[c]!;
      // Both ways along this contact's surface; downhill means a positive y component.
      for (let s = -1; s <= 1; s += 2) {
        const tx = -ny * s;
        const ty = nx * s;
        if (ty > best && this.allows(tx, ty)) {
          best = ty;
          found = true;
          this.wayX = tx;
          this.wayY = ty;
        }
      }
    }
    if (found) return 1;
    const onlyApex =
      contacts === 1 && contactOf[0]! >= 0 && contactNy[0]! < 0 && Math.abs(contactNx[0]!) < APEX;
    return onlyApex ? 2 : 0;
  }

  /** Whether moving in direction (tx, ty) pushes into none of the contacts. */
  private allows(tx: number, ty: number): boolean {
    for (let c = 0; c < this.contacts; c++) {
      if (tx * this.contactNx[c]! + ty * this.contactNy[c]! < -FEASIBLE) return false;
    }
    return true;
  }

  /**
   * How far along the move (mx, my) from (px, py) icon `i` gets before it touches something
   * it wasn't touching already, as a share of the move: 1 if it gets all the way. Sets
   * `blockedByMover` when what cut it short was a moving icon.
   */
  private sweep(i: number, px: number, py: number, mx: number, my: number): number {
    const r = this.radius;
    const d = 2 * r;
    let t = 1;
    this.blockedByMover = false;

    const floor = this.height - r;
    if (my > 0 && py + my > floor) t = Math.min(t, Math.max(0, (floor - py) / my));
    if (mx < 0 && px + mx < r) t = Math.min(t, Math.max(0, (r - px) / mx));
    const right = this.width - r;
    if (mx > 0 && px + mx > right) t = Math.min(t, Math.max(0, (right - px) / mx));

    const a = mx * mx + my * my;
    if (a === 0) return t;
    // The cells the move crosses, with a margin for moving icons that left their cell.
    const c0 = this.colOf(Math.min(px, px + mx) - 2 * d);
    const c1 = this.colOf(Math.max(px, px + mx) + 2 * d);
    const r0 = this.rowOf(Math.min(py, py + my) - 2 * d);
    const r1 = this.rowOf(Math.max(py, py + my) + 2 * d);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const c = row * this.cols + col;
        const resting = this.sweepCell(this.head[c]!, this.next, i, px, py, mx, my, a, t);
        if (resting < t) {
          t = resting;
          this.blockedByMover = false;
        }
        const moving = this.sweepCell(
          this.movingHead[c]!,
          this.movingNext,
          i,
          px,
          py,
          mx,
          my,
          a,
          t,
        );
        if (moving < t) {
          t = moving;
          this.blockedByMover = true;
        }
      }
    }
    return t;
  }

  /** The earliest touch along the move with the icons in one cell's list, below `t`, or `t`. */
  private sweepCell(
    first: number,
    link: Int32Array,
    i: number,
    px: number,
    py: number,
    mx: number,
    my: number,
    a: number,
    t: number,
  ): number {
    const { x, y, contactOf, contacts } = this;
    const d2 = 4 * this.radius * this.radius;
    candidates: for (let j = first; j !== -1; j = link[j]!) {
      if (j === i) continue;
      for (let c = 0; c < contacts; c++) if (contactOf[c] === j) continue candidates;
      const ox = px - x[j]!;
      const oy = py - y[j]!;
      const b = mx * ox + my * oy;
      if (b >= 0) continue; // moving away from it
      const cc = ox * ox + oy * oy - d2;
      if (cc < 0) {
        // Overlapping already and heading further in: stay put, and let `settleOnto` push
        // it clear next step.
        t = 0;
        continue;
      }
      const disc = b * b - a * cc;
      if (disc < 0) continue;
      const hit = (-b - Math.sqrt(disc)) / a;
      if (hit < t) t = hit;
    }
    return t;
  }

  /**
   * Put icon `i` at (px, py), exactly touching what it was touching: out of anything it has
   * come to overlap, and back onto the support it slid along (its move was along that
   * surface, in direction (dirX, dirY)) and drifted off by rounding the corner. If pushing
   * out sideways leaves it inside resting icons still (there is no room between them), it
   * is lifted up onto them instead.
   */
  private settleOnto(i: number, px: number, py: number, dirX: number, dirY: number): void {
    const { x, y, resting, contactOf, contactNx, contactNy, contacts } = this;
    const r = this.radius;
    const d = 2 * r;
    for (let c = 0; c < contacts; c++) {
      const j = contactOf[c]!;
      if (j < 0) continue;
      const dx = px - x[j]!;
      const dy = py - y[j]!;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1e-6) {
        py = y[j]! - d;
        continue;
      }
      const along = Math.abs(dirX * contactNx[c]! + dirY * contactNy[c]!) < ALONG;
      if (dist < d || (along && dist <= d + SNAP)) {
        px = x[j]! + (dx / dist) * d;
        py = y[j]! + (dy / dist) * d;
      }
    }
    if (px < r) px = r;
    else if (px > this.width - r) px = this.width - r;
    if (py > this.height - r) py = this.height - r;
    for (let c = 0; c < contacts; c++) {
      const j = contactOf[c]!;
      if (j < 0 || !resting[j]) continue;
      const dx = px - x[j]!;
      const dy = py - y[j]!;
      if (dx * dx + dy * dy >= d * d - OVERLAP) continue;
      const above = y[j]! - Math.sqrt(Math.max(0, d * d - dx * dx));
      if (above < py) py = above;
    }
    x[i] = px;
    y[i] = py;
  }

  /** Put icon `i` to rest at (px, py): into the resting grid, out of the moving list. */
  private stop(i: number, px: number, py: number): void {
    this.x[i] = px;
    this.y[i] = py;
    this.speed[i] = 0;
    this.resting[i] = 1;
    const c = this.cellOf(px, py);
    this.next[i] = this.head[c]!;
    this.head[c] = i;
    if (py < this.topY) this.topY = py;
    this.settledBuf[this.settledLen++] = i;
  }
}
