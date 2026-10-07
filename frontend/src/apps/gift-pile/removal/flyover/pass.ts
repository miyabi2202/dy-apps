import type { Scoop } from '../../core/protocol';
import type { Hooks, Take } from '../../render/overlay';
import { Haul, type Removal, type World } from '../removal';
import type { RemovalSink } from '../sink';
import { type Course, type Craft, OVERSHOOT } from './craft';

// Timing, in ms, and geometry, in world (CSS) pixels.
/**
 * After a craft has crossed, it carries on out of sight for this long (and longer for
 * whatever trails behind it), while the last icons are drawn in.
 */
const TAIL_MS = 700;
/** An icon is caught by the suction when the nozzle is this far short of it. */
const REACH = 80;
/** How long an icon takes to reach the nozzle: a base plus a bit per pixel of climb. */
const LIFT_MIN_MS = 320;
const LIFT_PER_PX = 0.25;
const LIFT_MAX_MS = 800;
/** Icons are caught up to this much later than the nozzle's passing, so they don't rise as a wall. */
const JITTER_MS = 140;
/** How far an icon swings from side to side on its way in, and how many half turns it makes. */
const SWIRL = 14;
const SWIRL_TURNS = 3;
/** An icon shrinks to this on the way into the nozzle. */
const SUCKED_SCALE = 0.3;
/** The nozzle passes this far above the highest icon it takes. */
const NOZZLE_CLEARANCE = 46;
/** When the extras are spat back out, as fractions of the crossing. */
const DROP_FROM = 0.3;
const DROP_TO = 0.8;

/**
 * One craft's trip across the canvas, carrying off the icons of one scoop with its intake.
 * They stay in the pile until the nozzle comes near each; then it is grabbed and sucked up,
 * swinging and shrinking on the way, and whatever rested on it falls as it goes. The ones
 * marked to drop are spat back out over the pile (see `drops`), and when the craft is out
 * of sight the rest are destroyed (`end`).
 */
export class Pass implements Removal {
  readonly craft: Craft;
  private readonly course: Course;
  private readonly t0: number;
  /** How long after `t0` it is all out of sight. */
  private readonly endMs: number;
  private readonly startX = -OVERSHOOT;
  /** Pixels per ms. */
  private readonly speed: number;
  private readonly haul: Haul;
  /** Where each icon lifts from: where it was scooped, until it is taken. */
  private readonly x0: Float32Array;
  private readonly y0: Float32Array;
  /** When each is caught by the suction, and how long it takes to reach the nozzle. */
  private readonly liftAt: Float32Array;
  private readonly liftMs: Float32Array;
  /** Which way each swings first, and where in its swing it starts. */
  private readonly phase: Float32Array;
  /** Which of the taken icons have gone all the way in. */
  private readonly arrived: Uint8Array;
  /** The icons to drop back, in time order. */
  private readonly dropAt: { k: number; at: number }[] = [];
  /** Icons inside, for the intake's gauge. */
  private inside = 0;

  /**
   * A craft sets off at wall time `now` with the icons of `scoop`, flying just high enough
   * for the nozzle to clear the highest of them.
   */
  constructor(
    sink: RemovalSink,
    craft: Craft,
    scoop: Scoop,
    world: World,
    now: number,
    rng: () => number,
  ) {
    const n = scoop.ids.length;
    this.craft = craft;
    this.t0 = now;
    this.haul = new Haul(sink, scoop);
    let top = Infinity;
    for (let k = 0; k < n; k++) top = Math.min(top, scoop.xy[2 * k + 1]!);
    // From the craft's centre down to where icons go in, and how far it dips below its altitude.
    const toNozzle = craft.tie.dy + craft.intake.reach;
    const sag = craft.sag(world);
    const altitude = Math.min(
      Math.max(craft.minY(world), top - NOZZLE_CLEARANCE - toNozzle - sag),
      world.height - toNozzle - sag,
    );
    this.course = { ...world, altitude, crossMs: craft.crossMs };
    this.speed = (world.width + 2 * OVERSHOOT) / craft.crossMs;
    this.endMs = craft.crossMs + TAIL_MS + (craft.trail ?? 0) / this.speed;

    this.x0 = new Float32Array(n);
    this.y0 = new Float32Array(n);
    this.liftAt = new Float32Array(n);
    this.liftMs = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.arrived = new Uint8Array(n);
    const nozzleY = altitude + toNozzle;
    for (let k = 0; k < n; k++) {
      const x = scoop.xy[2 * k]!;
      const y = scoop.xy[2 * k + 1]!;
      this.x0[k] = x;
      this.y0[k] = y;
      // The nozzle trails the craft a little, so it reaches the icon after the craft does.
      this.liftAt[k] =
        now + Math.max(0, (x - REACH - this.startX) / this.speed) + rng() * JITTER_MS;
      const climb = Math.abs(y - nozzleY);
      this.liftMs[k] = Math.min(LIFT_MAX_MS, LIFT_MIN_MS + climb * LIFT_PER_PX);
      this.phase[k] = rng() * Math.PI * 2;
    }

    // The ones to spit out are the first in, so they can fall while the craft is still
    // over the pile; each goes at a random moment of the crossing once it is inside.
    const drop = Math.min(scoop.drop, n);
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

  drops(): number[] {
    return this.haul.drops();
  }

  end(take: Take): number[] {
    return this.haul.end(take);
  }

  /**
   * Draw the pass as of wall time `now`: scenery, the craft's intake, the craft, then the
   * icons on their way in.
   */
  draw(ctx: CanvasRenderingContext2D, now: number, hooks: Hooks): void {
    const { craft, course } = this;
    const { stamp, take } = hooks;
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
      this.haul.drop(k, openings.outX, openings.outY, take);
    }

    craft.drawScene?.(ctx, course, t, this.endMs - t);
    intake.draw(ctx, tieX, tieY, t, this.inside / this.haul.size);
    craft.draw(ctx, px, py, tilt, t);

    // Icons the intake has reached: swinging up into it, or counted inside.
    const { inX: nx, inY: ny } = openings;
    const n = this.haul.size;
    let inside = 0;
    for (let k = 0; k < n; k++) {
      if (this.haul.isDropped(k)) continue;
      if (this.arrived[k]) {
        inside++;
        continue;
      }
      if (now < this.liftAt[k]!) continue;
      this.takeIcon(k, take);
      const u = (now - this.liftAt[k]!) / this.liftMs[k]!;
      if (u >= 1) {
        this.arrived[k] = 1;
        inside++;
        continue;
      }
      // Slow to start and ever faster towards the nozzle, as suction takes hold.
      const e = u * u * (2 - u * u);
      const x = this.x0[k]! + (nx - this.x0[k]!) * e;
      const y = this.y0[k]! + (ny - this.y0[k]!) * e;
      const swing = Math.sin(u * Math.PI * SWIRL_TURNS + this.phase[k]!) * SWIRL * (1 - u);
      const scale = 1 - (1 - SUCKED_SCALE) * Math.max(0, (u - 0.6) / 0.4);
      stamp(x + swing, y, scale);
    }
    this.inside = inside;
  }

  /** Icon `k` leaves the pile for the pass, if it hasn't yet, lifting from wherever it is now. */
  private takeIcon(k: number, take: Take): void {
    const at = this.haul.take(k, take);
    if (at) {
      this.x0[k] = at.x;
      this.y0[k] = at.y;
    }
  }
}
