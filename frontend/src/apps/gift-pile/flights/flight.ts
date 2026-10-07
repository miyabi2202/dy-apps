import type { Scoop } from '../core/protocol';
import type { Hooks, Take } from '../render/overlay';
import { type Course, type Craft, OVERSHOOT, type World } from './crafts/craft';
import type { FlightSink } from './sink';
import { drawSuction, drawVacuum, TIE_TO_NOZZLE, vacuumAt } from './vacuum';

// Timing, in ms, and geometry, in world (CSS) pixels.
/** After a craft has crossed, it carries on out of sight for this long, while the last icons are drawn in. */
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

/** Where an icon is in its flight. */
const WAITING = 0; // still in the pile, drawn by the renderer
const LIFTING = 1; // grabbed, on its way into the nozzle
const INSIDE = 2; // in the canister
const DROPPED = 3; // spat back out, the engine's again

/**
 * One craft's trip across the canvas with the vacuum, carrying off the icons of one scoop.
 * They stay in the pile until the nozzle comes near each; then it is grabbed and sucked up,
 * swinging and shrinking on the way, and whatever rested on it falls as it goes. The ones
 * marked to drop are spat back out over the pile (see `drops`), and when the craft is out
 * of sight the rest are destroyed (`end`).
 */
export class Flight {
  readonly craft: Craft;
  private readonly course: Course;
  private readonly t0: number;
  private readonly startX = -OVERSHOOT;
  /** Pixels per ms. */
  private readonly speed: number;
  private readonly ids: Int32Array;
  /** Where each icon lifts from: where it was scooped, until it is taken. */
  private readonly x0: Float32Array;
  private readonly y0: Float32Array;
  /** When each is caught by the suction, and how long it takes to reach the nozzle. */
  private readonly liftAt: Float32Array;
  private readonly liftMs: Float32Array;
  /** Which way each swings first, and where in its swing it starts. */
  private readonly phase: Float32Array;
  private readonly stage: Uint8Array;
  /** The icons to drop back, in time order. */
  private readonly dropAt: { k: number; at: number }[] = [];
  /** Icons in the canister, for its gauge. */
  private inside = 0;
  /** Icons spat out since the last `drops()`. */
  private dropped: number[] = [];

  /**
   * A craft sets off at wall time `now` with the icons of `scoop`, flying just high enough
   * for the nozzle to clear the highest of them.
   */
  constructor(
    private readonly sink: FlightSink,
    craft: Craft,
    scoop: Scoop,
    world: World,
    now: number,
    rng: () => number,
  ) {
    const n = scoop.ids.length;
    this.craft = craft;
    this.t0 = now;
    this.ids = scoop.ids;
    let top = Infinity;
    for (let k = 0; k < n; k++) top = Math.min(top, scoop.xy[2 * k + 1]!);
    // From the craft's centre down to the nozzle, and how far it dips below its altitude.
    const toNozzle = craft.tie.dy + TIE_TO_NOZZLE;
    const sag = craft.sag(world);
    const altitude = Math.min(
      Math.max(craft.minY(world), top - NOZZLE_CLEARANCE - toNozzle - sag),
      world.height - toNozzle - sag,
    );
    this.course = { ...world, altitude, crossMs: craft.crossMs };
    this.speed = (world.width + 2 * OVERSHOOT) / craft.crossMs;

    this.x0 = new Float32Array(n);
    this.y0 = new Float32Array(n);
    this.liftAt = new Float32Array(n);
    this.liftMs = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.stage = new Uint8Array(n);
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

    // The ones to spit out are the first in, so they can fall while the vacuum is still
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

  /** The icons this flight set off with. */
  forEachIcon(fn: (id: number) => void): void {
    this.ids.forEach((id) => fn(id));
  }

  /** The craft is out of sight. */
  isOver(now: number): boolean {
    return now >= this.t0 + this.course.crossMs + TAIL_MS;
  }

  /** Icons spat out since the last call. */
  drops(): number[] {
    const out = this.dropped;
    this.dropped = [];
    return out;
  }

  /** The craft is gone: whatever it still holds is destroyed. Returns those icons. */
  end(take: Take): number[] {
    const gone: number[] = [];
    this.ids.forEach((id, k) => {
      if (this.stage[k] === DROPPED) return;
      // One the suction never reached (the tab was hidden) still goes with the craft.
      if (this.stage[k] === WAITING) this.takeIcon(k, take);
      this.sink.destroy(id);
      gone.push(id);
    });
    return gone;
  }

  /** Draw the flight as of wall time `now`: scenery, suction, vacuum, craft, then the icons on their way in. */
  draw(ctx: CanvasRenderingContext2D, now: number, hooks: Hooks): void {
    const { craft, course } = this;
    const { stamp, take } = hooks;
    const t = now - this.t0;
    const px = this.startX + this.speed * t;
    const { py, tilt } = craft.pathAt(course, px, t);
    const tieX = px + craft.tie.dx;
    const tieY = py + craft.tie.dy;
    const vacuum = vacuumAt(tieX, tieY, t);

    // Icons whose moment has come are spat out of the back of the canister.
    while (this.dropAt.length > 0 && this.dropAt[0]!.at <= now) {
      const { k } = this.dropAt.shift()!;
      if (this.stage[k] === DROPPED) continue;
      if (this.stage[k] === WAITING) this.takeIcon(k, take);
      this.stage[k] = DROPPED;
      this.dropped.push(this.ids[k]!);
      this.sink.release(this.ids[k]!, vacuum.exhaustX, vacuum.exhaustY);
    }

    craft.drawScene?.(ctx, course, t, course.crossMs + TAIL_MS - t);
    drawSuction(ctx, vacuum, now);
    drawVacuum(ctx, tieX, tieY, vacuum, this.inside / this.ids.length);
    craft.draw(ctx, px, py, tilt);

    // Icons the suction has reached: swinging up into the nozzle, or counted inside.
    const { nx, ny } = vacuum;
    const n = this.ids.length;
    let inside = 0;
    for (let k = 0; k < n; k++) {
      const stage = this.stage[k];
      if (stage === DROPPED) continue;
      if (stage === INSIDE) {
        inside++;
        continue;
      }
      if (now < this.liftAt[k]!) continue;
      if (stage === WAITING) this.takeIcon(k, take);
      const u = (now - this.liftAt[k]!) / this.liftMs[k]!;
      if (u >= 1) {
        this.stage[k] = INSIDE;
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

  /** Icon `k` leaves the pile for the flight, lifting from wherever it is now. */
  private takeIcon(k: number, take: Take): void {
    const id = this.ids[k]!;
    const at = take(id);
    if (at) {
      this.x0[k] = at.x;
      this.y0[k] = at.y;
    }
    this.sink.grab(id);
    this.stage[k] = LIFTING;
  }
}
