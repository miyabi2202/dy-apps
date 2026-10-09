import type { Board, Gfx } from '../board';

/** How fast what it bats off falls, in px per second squared. */
const GRAVITY = 900;
/** One still in the air after this long is gone anyway, in ms. */
const LONGEST_MS = 4000;

/**
 * The icons the cat has batted off the pile, tumbling through the air in arcs until they are
 * off the screen, when each is `destroy`ed. Where each is comes from when it was batted, so
 * however far apart the frames are they fly the same way. They are drawn together, in one run.
 */
export class Flights {
  private readonly id: Int32Array;
  private readonly x0: Float32Array;
  private readonly y0: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly spin: Float32Array;
  private readonly at: Float32Array;
  private count = 0;

  constructor(
    private readonly board: Board,
    capacity: number,
  ) {
    this.id = new Int32Array(capacity);
    this.x0 = new Float32Array(capacity);
    this.y0 = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.at = new Float32Array(capacity);
  }

  /** How many are still in the air. */
  get alive(): number {
    return this.count;
  }

  /** Icon `i` is batted off from (x, y) at `t` ms, at (vx, vy) px per second, spinning `spin` radians a second. */
  launch(i: number, x: number, y: number, vx: number, vy: number, spin: number, t: number): void {
    this.board.take(i);
    const k = this.count++;
    this.id[k] = i;
    this.x0[k] = x;
    this.y0[k] = y;
    this.vx[k] = vx;
    this.vy[k] = vy;
    this.spin[k] = spin;
    this.at[k] = t;
  }

  /** Draw them as of `t`, destroying each that has gone off the screen. */
  draw(gfx: Gfx, t: number): void {
    const { board } = this;
    const { view } = board.camera;
    const margin = board.iconRadius * 3;
    const left = -margin;
    const right = board.world.width + margin;
    const bottom = view.top + view.height + margin;
    let k = 0;
    while (k < this.count) {
      const age = t - this.at[k]!;
      const s = Math.max(0, age) / 1000;
      const x = this.x0[k]! + this.vx[k]! * s;
      const y = this.y0[k]! + this.vy[k]! * s + 0.5 * GRAVITY * s * s;
      if (x < left || x > right || y > bottom || age > LONGEST_MS) {
        board.destroy(this.id[k]!);
        this.remove(k);
        continue;
      }
      gfx.icon(x, y, 1, { rotation: this.spin[k]! * s });
      k++;
    }
  }

  /** Let go of flight `k`: the last takes its place. */
  private remove(k: number): void {
    const last = --this.count;
    if (k === last) return;
    this.id[k] = this.id[last]!;
    this.x0[k] = this.x0[last]!;
    this.y0[k] = this.y0[last]!;
    this.vx[k] = this.vx[last]!;
    this.vy[k] = this.vy[last]!;
    this.spin[k] = this.spin[last]!;
    this.at[k] = this.at[last]!;
  }
}
