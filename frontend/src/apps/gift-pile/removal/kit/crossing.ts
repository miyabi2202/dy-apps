import type { Board, Removal } from '../board';
import { type Course, type Craft, OVERSHOOT } from './craft';

// Timing, in ms, and geometry, in world (CSS) pixels.
/**
 * After a craft has crossed, it carries on out of sight for this long (and longer for
 * whatever trails behind it), while the last icons are drawn in.
 */
const TAIL_MS = 700;
/** An icon is caught by the intake when it is this far short of it. */
const REACH = 80;
/** How long an icon takes to reach the intake: a base plus a bit per pixel of climb. */
const LIFT_MIN_MS = 320;
const LIFT_PER_PX = 0.25;
const LIFT_MAX_MS = 800;
/** Icons are caught up to this much later than the intake's passing, so they don't rise as a wall. */
const JITTER_MS = 140;
/** How far an icon swings from side to side on its way in, and how many half turns it makes. */
const SWIRL = 14;
const SWIRL_TURNS = 3;
/** An icon shrinks to this on the way in. */
const SUCKED_SCALE = 0.3;
/** The intake passes this far above the highest icon it takes. */
const CLEARANCE = 46;
/** When the extras are spat back out, as fractions of the crossing. */
const DROP_FROM = 0.3;
const DROP_TO = 0.8;

/** Where an icon is in the crossing. */
const WAITING = 0; // still in the pile
const LIFTING = 1; // on its way into the intake
const INSIDE = 2; // in
const DROPPED = 3; // spat back out

/**
 * A craft's trip across the canvas, left to right, carrying off the board's icons with its
 * intake: a removal any craft can run as its own (see `Craft`). The icons stay in the pile
 * until the intake comes near each; then it is taken and drawn in, swinging and shrinking
 * on the way, and whatever rested on it falls as it goes. The ones to drop are spat back out
 * over the pile, and the rest go with the craft.
 */
export class Crossing implements Removal {
  private readonly course: Course;
  private readonly t0: number;
  /** How long after `t0` it is all out of sight. */
  private readonly endMs: number;
  private readonly startX = -OVERSHOOT;
  /** Pixels per ms. */
  private readonly speed: number;
  /** Where each icon lifts from: where it was set aside, until it is taken. */
  private readonly x0: Float32Array;
  private readonly y0: Float32Array;
  /** When each is caught by the intake, and how long it takes to get in. */
  private readonly liftAt: Float32Array;
  private readonly liftMs: Float32Array;
  /** Which way each swings first, and where in its swing it starts. */
  private readonly phase: Float32Array;
  private readonly stage: Uint8Array;
  /** The icons to drop back, in time order. */
  private readonly dropAt: { k: number; at: number }[] = [];
  /** Icons inside, for the intake's gauge. */
  private inside = 0;

  /**
   * `craft` sets off at wall time `now`, at the height where its intake just clears the
   * highest of the board's icons.
   */
  constructor(
    private readonly craft: Craft,
    private readonly board: Board,
    now: number,
    rng: () => number,
  ) {
    const { world, icons } = board;
    const n = icons.length;
    this.t0 = now;
    let top = Infinity;
    for (const { y } of icons) top = Math.min(top, y);
    // From the craft's centre down to where icons go in, and how far it dips below its altitude.
    const toIntake = craft.tie.dy + craft.intake.reach;
    const sag = craft.sag(world);
    const altitude = Math.min(
      Math.max(craft.minY(world), top - CLEARANCE - toIntake - sag),
      world.height - toIntake - sag,
    );
    this.course = { ...world, altitude, crossMs: craft.crossMs };
    this.speed = (world.width + 2 * OVERSHOOT) / craft.crossMs;
    this.endMs = craft.crossMs + TAIL_MS + (craft.trail ?? 0) / this.speed;

    this.x0 = new Float32Array(n);
    this.y0 = new Float32Array(n);
    this.liftAt = new Float32Array(n);
    this.liftMs = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.stage = new Uint8Array(n);
    const intakeY = altitude + toIntake;
    icons.forEach(({ x, y }, k) => {
      this.x0[k] = x;
      this.y0[k] = y;
      // The intake trails the craft a little, so it reaches the icon after the craft does.
      this.liftAt[k] =
        now + Math.max(0, (x - REACH - this.startX) / this.speed) + rng() * JITTER_MS;
      const climb = Math.abs(y - intakeY);
      this.liftMs[k] = Math.min(LIFT_MAX_MS, LIFT_MIN_MS + climb * LIFT_PER_PX);
      this.phase[k] = rng() * Math.PI * 2;
    });

    // The ones to spit out are the first in, so they can fall while the craft is still
    // over the pile; each goes at a random moment of the crossing once it is inside.
    const drop = board.dropCount;
    if (drop > 0) {
      const order = Array.from({ length: n }, (_, k) => k).sort(
        (a, b) => this.liftAt[a]! + this.liftMs[a]! - (this.liftAt[b]! + this.liftMs[b]!),
      );
      const lastOver = now + (world.width - this.startX) / this.speed;
      for (const k of order.slice(0, drop)) {
        const inside = this.liftAt[k]! + this.liftMs[k]! + 150;
        const when = now + craft.crossMs * (DROP_FROM + (DROP_TO - DROP_FROM) * rng());
        this.dropAt.push({ k, at: Math.max(inside, Math.min(when, lastOver)) });
      }
      this.dropAt.sort((a, b) => a.at - b.at);
    }
  }

  /** The craft, and anything trailing it, is out of sight. */
  isOver(now: number): boolean {
    return now >= this.t0 + this.endMs;
  }

  /**
   * Draw the crossing as of wall time `now`: scenery, the craft's intake, the craft, then
   * the icons on their way in.
   */
  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const { craft, course, board } = this;
    const t = now - this.t0;
    const px = this.startX + this.speed * t;
    const { py, tilt } = craft.pathAt(course, px, t);
    const tieX = px + craft.tie.dx;
    const tieY = py + craft.tie.dy;
    const { intake } = craft;
    const openings = intake.openings(tieX, tieY, t);

    // Icons whose moment has come are spat out.
    while (this.dropAt.length > 0 && this.dropAt[0]!.at <= now) {
      const { k } = this.dropAt.shift()!;
      if (this.stage[k] === DROPPED) continue;
      this.stage[k] = DROPPED;
      board.drop(k, openings.outX, openings.outY);
    }

    craft.drawScene?.(ctx, course, t, this.endMs - t);
    intake.draw(ctx, tieX, tieY, t, this.inside / board.icons.length);
    craft.draw(ctx, px, py, tilt, t);

    // Icons the intake has reached: swinging up into it, or counted inside.
    const { inX, inY } = openings;
    const n = board.icons.length;
    let inside = 0;
    for (let k = 0; k < n; k++) {
      const stage = this.stage[k];
      if (stage === DROPPED) continue;
      if (stage === INSIDE) {
        inside++;
        continue;
      }
      if (now < this.liftAt[k]!) continue;
      if (stage === WAITING) this.takeIcon(k);
      const u = (now - this.liftAt[k]!) / this.liftMs[k]!;
      if (u >= 1) {
        this.stage[k] = INSIDE;
        inside++;
        continue;
      }
      // Slow to start and ever faster towards the intake, as suction takes hold.
      const e = u * u * (2 - u * u);
      const x = this.x0[k]! + (inX - this.x0[k]!) * e;
      const y = this.y0[k]! + (inY - this.y0[k]!) * e;
      const swing = Math.sin(u * Math.PI * SWIRL_TURNS + this.phase[k]!) * SWIRL * (1 - u);
      const scale = 1 - (1 - SUCKED_SCALE) * Math.max(0, (u - 0.6) / 0.4);
      board.stamp(x + swing, y, scale);
    }
    this.inside = inside;
  }

  /** Icon `k` leaves the pile, lifting from wherever it is now. */
  private takeIcon(k: number): void {
    const at = this.board.take(k);
    if (at) {
      this.x0[k] = at.x;
      this.y0[k] = at.y;
    }
    this.stage[k] = LIFTING;
  }
}
