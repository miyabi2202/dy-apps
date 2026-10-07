import type { Scoop } from '../core/protocol';

/** What the flights ask of the engine, through the worker; `PileClient` is one. */
export interface FlightSink {
  /** Set `count` icons aside for a flight, `extra` of them to be dropped back. */
  scoop(count: number, extra: number): void;
  /** Destroy `count` icons at once. */
  remove(count: number): void;
  /** Take icon `id` out of the pile; it is held from then on. */
  grab(id: number): void;
  /** Let held icon `id` go at (x, y): it falls from there. */
  release(id: number, x: number, y: number): void;
  /** Held icon `id` is gone for good. */
  destroy(id: number): void;
}

/** Stamps the icon sprite centred at (x, y), in world pixels, at `scale` times its size. */
export type Stamp = (x: number, y: number, scale?: number) => void;

/**
 * Where icon `id` is now, in world pixels, or null if the renderer doesn't have it; the
 * renderer stops drawing it from here on, as the flight takes over.
 */
export type Take = (id: number) => { x: number; y: number } | null;

/** What carries the vacuum: picked at random for each flight. */
export type Craft = 'plane' | 'balloon' | 'car';

interface Options {
  /** Random numbers in [0, 1). */
  rng?: () => number;
  /** The crafts to pick from; all of them unless a test narrows it. */
  crafts?: readonly Craft[];
}

/** The most icons one plane carries; any more asked for go at once, without a flight. */
export const VACUUM_CAPACITY = 2000;
/** How many icons over the number asked for the vacuum takes, to spit back out on the way. */
const EXTRA_SHARE = 0.12;
const EXTRA_MAX = 12;

// Timing, in ms, and geometry, in world (CSS) pixels.
/** After a craft has crossed, it carries on out of sight for this long, while the last icons are drawn in. */
const TAIL_MS = 700;
/** The next queued craft sets off this long after the one before is gone, so two are never up at once. */
const QUEUE_GAP_MS = 2000;
/** How far outside the canvas a craft starts and finishes. */
const OVERSHOOT = 70;
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
/** The nozzle flies this far above the highest icon it takes. */
const NOZZLE_CLEARANCE = 46;
/** Where a plane or balloon starts to climb away, as a fraction of the width, and by how much. */
const CLIMB_FROM = 0.7;
const CLIMB = 90;
const PLANE_SIZE = 72;
/** The balloon: its envelope's radius, the skirt below it, the lines down to the basket, and the basket. */
const BALLOON_R = 30;
const BALLOON_SKIRT = 12;
const BALLOON_LINES = 14;
const BASKET_W = 20;
const BASKET_H = 12;
const BALLOON_STRIPES = 8;
/** The hypercar: its length, and how far its centre sits above the road. */
const CAR_L = 64;
const CAR_LIFT = 12;
/** The split bridge the car jumps: each half's run and rise, and how high the car jumps the gap. */
const RAMP_RUN_SHARE = 0.28;
const RAMP_RUN_MAX = 150;
const RAMP_RISE_SHARE = 0.42;
const JUMP_H = 55;
/** The ramps fade in and out over this long. */
const RAMP_FADE_MS = 300;

/**
 * Each craft: how long it takes to cross the canvas (a balloon drifts, a hypercar hurries,
 * but not so fast you miss it), from its centre down to where the rope ties on, and how
 * near the top of the canvas its centre may be while still showing.
 */
const CRAFTS: Record<Craft, { crossMs: number; hang: number; minY: number }> = {
  plane: { crossMs: 4800, hang: 13, minY: 44 },
  balloon: {
    crossMs: 5600,
    hang: BALLOON_R + BALLOON_SKIRT + BALLOON_LINES + BASKET_H,
    minY: BALLOON_R + 8,
  },
  car: { crossMs: 4200, hang: CAR_LIFT, minY: JUMP_H + 24 },
};
const ALL_CRAFTS: readonly Craft[] = ['plane', 'balloon', 'car'];
/**
 * The paper plane image is mirrored, so its long wedge leads and the keel's fold trails like
 * a tail fin; mirrored it points up and to the right, and turned this far its nose is a
 * little up.
 */
const PLANE_IMAGE_ANGLE = 0.19;
/** The rope from the craft to the canister, and how far behind the craft the canister trails. */
const ROPE = 18;
const TRAIL = 14;
/** The canister's body, and the nozzle's width and how far below the canister it hangs. */
const BODY_W = 22;
const BODY_H = 13;
const NOZZLE_W = 16;
const NOZZLE_DROP = 16;
/** The suction cone below the nozzle: how far down it shows and how wide it gets. */
const CONE_LENGTH = 110;
const CONE_HALF_WIDTH = 42;
/** When the extras are spat back out, as fractions of the crossing. */
const DROP_FROM = 0.3;
const DROP_TO = 0.8;

/** How many to fly, how many extra to take and drop back, and how many to remove at once. */
export function planRemoval(count: number): { fly: number; extra: number; instant: number } {
  const fly = Math.min(count, VACUUM_CAPACITY);
  const extra = fly === 0 ? 0 : Math.min(EXTRA_MAX, Math.max(1, Math.round(fly * EXTRA_SHARE)));
  return { fly, extra, instant: count - fly };
}

/** Where an icon is in its flight. */
const WAITING = 0; // still in the pile, drawn by the renderer
const LIFTING = 1; // grabbed, on its way into the nozzle
const INSIDE = 2; // in the canister
const DROPPED = 3; // spat back out, the engine's again

interface Flight {
  t0: number;
  craft: Craft;
  /** How long the crossing takes. */
  crossMs: number;
  /** From the craft's centre down to where the rope ties on. */
  hang: number;
  /** The canvas's width when the flight began. */
  width: number;
  /** The craft's centre's height while crossing (for the car: at the top of a ramp). */
  altitude: number;
  startX: number;
  /** Pixels per ms. */
  speed: number;
  ids: Int32Array;
  /** Where each icon lifts from: where it was scooped, until it is taken. */
  x0: Float32Array;
  y0: Float32Array;
  /** When each is caught by the suction, and how long it takes to reach the nozzle. */
  liftAt: Float32Array;
  liftMs: Float32Array;
  /** Which way each swings first, and where in its swing it starts. */
  phase: Float32Array;
  stage: Uint8Array;
  /** The icons to drop back, in time order. */
  drops: { k: number; at: number }[];
  /** Icons in the canister, for its gauge. */
  inside: number;
}

/** The split bridge for a car's flight: each half's horizontal run and rise. */
const ramps = (width: number) => {
  const run = Math.min(RAMP_RUN_MAX, width * RAMP_RUN_SHARE);
  return { run, rise: run * RAMP_RISE_SHARE };
};

/**
 * The flights that carry removed icons away. A paper plane, a hot-air balloon or a hypercar
 * (picked at random) enters at the left towing a vacuum cleaner on a rope and crosses just
 * above the pile: the plane and balloon fly over and climb away at the top right; the car
 * drives up one half of a split bridge, jumps the gap and drives off down the other. The
 * icons a flight is to take are set aside in the engine but stay in the pile until the
 * nozzle comes near each; then it is grabbed and sucked up, swinging and shrinking on the
 * way, and whatever rested on it falls as it goes. The vacuum takes a few more than asked
 * for and spits them back out over the pile, so what the pile loses is exactly the number
 * asked for. When the plane is out of sight, what it still holds is destroyed.
 *
 * Removals queue: a plane sets off when the one before is well across, so quick repeated
 * presses send planes one after another rather than all at once. Every icon a flight takes
 * ends up released or destroyed: on the tick the plane is gone, and at once on `reset()`,
 * since the engine has already let go of everything then.
 */
export class VacuumFlights {
  private flights: Flight[] = [];
  private readonly queue: { fly: number; extra: number }[] = [];
  /** A scoop has been asked for and its icons haven't come back in a frame yet. */
  private awaiting = false;
  /** When the last flight ended, for the gap before the next. */
  private lastEnded = -Infinity;
  /** Every icon in a flight, waiting, lifting or inside. */
  private readonly inFlight = new Set<number>();
  private plane: HTMLImageElement | null = null;
  private readonly rng: () => number;
  private readonly crafts: readonly Craft[];

  constructor(
    private readonly sink: FlightSink,
    { rng = Math.random, crafts = ALL_CRAFTS }: Options = {},
  ) {
    this.rng = rng;
    this.crafts = crafts;
  }

  /** The plane image; a drawn stand-in flies until it arrives. */
  setPlane(image: HTMLImageElement | null): void {
    this.plane = image;
  }

  /** Flights in the air. */
  get count(): number {
    return this.flights.length;
  }

  /** Removals waiting for a plane. */
  get queued(): number {
    return this.queue.length;
  }

  /** Icon `id` belongs to a flight, so the user can't pick it up. */
  holds(id: number): boolean {
    return this.inFlight.has(id);
  }

  /**
   * Remove `count` icons, at wall time `now`: a plane for as many as one carries, queued
   * behind any already going, and the rest at once.
   */
  remove(count: number, now: number): void {
    const { fly, extra, instant } = planRemoval(count);
    if (instant > 0) this.sink.remove(instant);
    if (fly > 0) this.queue.push({ fly, extra });
    this.launch(now);
  }

  /** The engine let everything go (a clear or resize): nothing is left to fly or to remove. */
  reset(): void {
    this.flights = [];
    this.queue.length = 0;
    this.awaiting = false;
    this.lastEnded = -Infinity;
    this.inFlight.clear();
  }

  /** The icons the engine set aside for the next plane have arrived: it sets off at wall time `now`. */
  start(scoop: Scoop, world: { width: number; height: number }, now: number): void {
    this.awaiting = false;
    const n = scoop.ids.length;
    if (n === 0) return;
    const { rng } = this;
    let top = Infinity;
    for (let k = 0; k < n; k++) top = Math.min(top, scoop.xy[2 * k + 1]!);
    const craft = this.crafts[Math.floor(rng() * this.crafts.length)] ?? 'plane';
    const { crossMs, hang, minY } = CRAFTS[craft];
    // From the craft's centre down to the nozzle.
    const toNozzle = hang + ROPE + BODY_H / 2 + NOZZLE_DROP;
    const altitude = Math.min(
      Math.max(minY, top - NOZZLE_CLEARANCE - toNozzle),
      world.height - toNozzle,
    );
    const startX = -OVERSHOOT;
    const speed = (world.width + 2 * OVERSHOOT) / crossMs;

    const flight: Flight = {
      t0: now,
      craft,
      crossMs,
      hang,
      width: world.width,
      altitude,
      startX,
      speed,
      ids: scoop.ids,
      x0: new Float32Array(n),
      y0: new Float32Array(n),
      liftAt: new Float32Array(n),
      liftMs: new Float32Array(n),
      phase: new Float32Array(n),
      stage: new Uint8Array(n),
      drops: [],
      inside: 0,
    };
    const nozzleY = altitude + toNozzle;
    for (let k = 0; k < n; k++) {
      const x = scoop.xy[2 * k]!;
      const y = scoop.xy[2 * k + 1]!;
      flight.x0[k] = x;
      flight.y0[k] = y;
      // The nozzle trails the plane, so it reaches the icon a little after the plane does.
      flight.liftAt[k] =
        now + Math.max(0, (x + TRAIL - REACH - startX) / speed) + rng() * JITTER_MS;
      const climb = Math.abs(y - nozzleY);
      flight.liftMs[k] = Math.min(LIFT_MAX_MS, LIFT_MIN_MS + climb * LIFT_PER_PX);
      flight.phase[k] = rng() * Math.PI * 2;
      this.inFlight.add(scoop.ids[k]!);
    }

    // The extras to spit out are the first in, so they can fall while the vacuum is still
    // over the pile; each goes at a random moment of the crossing once it is inside.
    const drop = Math.min(scoop.drop, n);
    if (drop > 0) {
      const order = Array.from({ length: n }, (_, k) => k).sort(
        (a, b) => flight.liftAt[a]! + flight.liftMs[a]! - (flight.liftAt[b]! + flight.liftMs[b]!),
      );
      const lastOver = now + (world.width - startX) / speed;
      for (const k of order.slice(0, drop)) {
        const inside = flight.liftAt[k]! + flight.liftMs[k]! + 150;
        const when = now + crossMs * (DROP_FROM + (DROP_TO - DROP_FROM) * rng());
        flight.drops.push({ k, at: Math.max(inside, Math.min(when, lastOver)) });
      }
      flight.drops.sort((a, b) => a.at - b.at);
    }
    this.flights.push(flight);
  }

  /**
   * Draw every flight as of wall time `now`, taking icons as the suction reaches them,
   * dropping and destroying them when their time has come, and sending the next plane off
   * when it may go.
   */
  draw(ctx: CanvasRenderingContext2D, now: number, stamp: Stamp, take: Take): void {
    this.flights = this.flights.filter((flight) => {
      if (now >= flight.t0 + flight.crossMs + TAIL_MS) {
        flight.ids.forEach((id, k) => {
          if (flight.stage[k] === DROPPED) return;
          // One the suction never reached (the tab was hidden) still goes with the craft.
          if (flight.stage[k] === WAITING) this.takeIcon(flight, k, take);
          this.sink.destroy(id);
          this.inFlight.delete(id);
        });
        this.lastEnded = now;
        return false;
      }
      this.drawFlight(ctx, flight, now, stamp, take);
      return true;
    });
    this.launch(now);
  }

  /** Send the next queued craft off, if none is going and the last has been gone long enough. */
  private launch(now: number): void {
    if (this.awaiting || this.queue.length === 0 || this.flights.length > 0) return;
    if (now - this.lastEnded < QUEUE_GAP_MS) return;
    const { fly, extra } = this.queue.shift()!;
    this.awaiting = true;
    this.sink.scoop(fly + extra, extra);
  }

  /** Icon `k` of `f` leaves the pile for the flight, lifting from wherever it is now. */
  private takeIcon(f: Flight, k: number, take: Take): void {
    const id = f.ids[k]!;
    const at = take(id);
    if (at) {
      f.x0[k] = at.x;
      f.y0[k] = at.y;
    }
    this.sink.grab(id);
    f.stage[k] = LIFTING;
  }

  /**
   * The craft's centre and heading at `px`, `t` ms into the flight. A plane or balloon flies
   * level and bobs, then climbs away along a parabola (the plane pointing along it). The car
   * runs up the left ramp, jumps the gap in an arc and runs down the right ramp, pointing
   * the way it is going.
   */
  private pathAt(f: Flight, px: number, t: number): { py: number; tilt: number } {
    if (f.craft === 'car') {
      const { run, rise } = ramps(f.width);
      const gap = f.width - 2 * run;
      if (px < run) {
        const s = Math.min(1, Math.max(0, px / run));
        return { py: f.altitude + rise * (1 - s), tilt: px < 0 ? 0 : -Math.atan2(rise, run) };
      }
      if (px <= run + gap) {
        const s = (px - run) / gap;
        const slope = (-JUMP_H * 4 * (1 - 2 * s)) / gap;
        return { py: f.altitude - JUMP_H * 4 * s * (1 - s), tilt: Math.atan(slope) };
      }
      const s = Math.min(1, (px - run - gap) / run);
      return { py: f.altitude + rise * s, tilt: s < 1 ? Math.atan2(rise, run) : 0 };
    }
    const climbRun = (1 - CLIMB_FROM) * f.width + OVERSHOOT;
    const over = (px - CLIMB_FROM * f.width) / climbRun;
    const climb = over > 0 ? over * over * CLIMB : 0;
    const bob = f.craft === 'plane' ? Math.sin(t / 160) * 2 : Math.sin(t / 420) * 4;
    const tilt = f.craft === 'plane' && over > 0 ? -Math.atan((2 * over * CLIMB) / climbRun) : 0;
    return { py: f.altitude - climb + bob, tilt };
  }

  private drawFlight(
    ctx: CanvasRenderingContext2D,
    f: Flight,
    now: number,
    stamp: Stamp,
    take: Take,
  ): void {
    const t = now - f.t0;
    const px = f.startX + f.speed * t;
    const { py, tilt } = this.pathAt(f, px, t);
    // Where the rope ties on: under the plane's belly, the basket or the car.
    const ax = f.craft === 'plane' ? px - 5 : px;
    const ay = py + f.hang;
    // The canister swings on its rope behind the craft; the nozzle hangs below it.
    const cx = px - TRAIL + Math.sin(t / 310) * 3;
    const cy = ay + ROPE + BODY_H / 2;
    const nx = cx - 4;
    const ny = cy + NOZZLE_DROP;

    // Extras whose moment has come are spat out of the back of the canister.
    while (f.drops.length > 0 && f.drops[0]!.at <= now) {
      const { k } = f.drops.shift()!;
      if (f.stage[k] === DROPPED) continue;
      if (f.stage[k] === WAITING) this.takeIcon(f, k, take);
      f.stage[k] = DROPPED;
      this.inFlight.delete(f.ids[k]!);
      this.sink.release(f.ids[k]!, cx - BODY_W / 2 - 4, cy + BODY_H / 2);
    }

    if (f.craft === 'car') this.drawRamps(ctx, f, t);
    this.drawSuction(ctx, nx, ny, now);
    this.drawVacuum(ctx, ax, ay, cx, cy, nx, ny, f.inside / f.ids.length);
    if (f.craft === 'plane') this.drawPlane(ctx, px, py, tilt);
    else if (f.craft === 'balloon') this.drawBalloon(ctx, px, py);
    else this.drawCar(ctx, px, py, tilt);

    // Icons the suction has reached: swinging up into the nozzle, or counted inside.
    const n = f.ids.length;
    let inside = 0;
    for (let k = 0; k < n; k++) {
      const stage = f.stage[k];
      if (stage === DROPPED) continue;
      if (stage === INSIDE) {
        inside++;
        continue;
      }
      if (now < f.liftAt[k]!) continue;
      if (stage === WAITING) this.takeIcon(f, k, take);
      const u = (now - f.liftAt[k]!) / f.liftMs[k]!;
      if (u >= 1) {
        f.stage[k] = INSIDE;
        inside++;
        continue;
      }
      // Slow to start and ever faster towards the nozzle, as suction takes hold.
      const e = u * u * (2 - u * u);
      const x = f.x0[k]! + (nx - f.x0[k]!) * e;
      const y = f.y0[k]! + (ny - f.y0[k]!) * e;
      const swing = Math.sin(u * Math.PI * SWIRL_TURNS + f.phase[k]!) * SWIRL * (1 - u);
      const scale = 1 - (1 - SUCKED_SCALE) * Math.max(0, (u - 0.6) / 0.4);
      stamp(x + swing, y, scale);
    }
    f.inside = inside;
  }

  /** The cone of air drawn into the nozzle, with streaks racing up it. */
  private drawSuction(ctx: CanvasRenderingContext2D, nx: number, ny: number, now: number): void {
    const bottom = ny + CONE_LENGTH;
    const cone = ctx.createLinearGradient(0, ny, 0, bottom);
    cone.addColorStop(0, 'rgba(147, 197, 253, 0.28)');
    cone.addColorStop(1, 'rgba(147, 197, 253, 0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(nx - NOZZLE_W / 2, ny);
    ctx.lineTo(nx - CONE_HALF_WIDTH, bottom);
    ctx.lineTo(nx + CONE_HALF_WIDTH, bottom);
    ctx.lineTo(nx + NOZZLE_W / 2, ny);
    ctx.closePath();
    ctx.fill();
    // Dashes sliding up the cone's edges and middle.
    ctx.save();
    ctx.strokeStyle = 'rgba(191, 219, 254, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = now / 12;
    ctx.beginPath();
    for (const f of [-0.7, 0, 0.7]) {
      ctx.moveTo(nx + f * CONE_HALF_WIDTH, bottom - 10);
      ctx.lineTo(nx + f * (NOZZLE_W / 2) * 0.8, ny + 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The rope from (ax, ay), the canister with its gauge of what it holds, the hose and the nozzle. */
  private drawVacuum(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    cx: number,
    cy: number,
    nx: number,
    ny: number,
    fullness: number,
  ): void {
    ctx.lineCap = 'round';
    // Rope.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx, cy - BODY_H / 2);
    ctx.stroke();
    // Hose: a curve from the canister's underside to the nozzle.
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + BODY_H / 2 - 2);
    ctx.quadraticCurveTo(cx - 9, cy + NOZZLE_DROP * 0.6, nx, ny - 2);
    ctx.stroke();
    // Canister body with a window showing how full it is.
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - BODY_W / 2, cy - BODY_H / 2, BODY_W, BODY_H, BODY_H / 2);
    ctx.fill();
    ctx.stroke();
    const winW = BODY_W * 0.45;
    const winH = BODY_H * 0.55;
    const winX = cx - winW / 2 + 2;
    const winY = cy - winH / 2;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(winX, winY, winW, winH);
    const level = winH * Math.min(1, fullness);
    ctx.fillStyle = '#fb7185';
    ctx.fillRect(winX, winY + winH - level, winW, level);
    // Exhaust at the back, where extras come out.
    ctx.fillStyle = '#475569';
    ctx.fillRect(cx - BODY_W / 2 - 3, cy - 2, 4, 4);
    // Nozzle.
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(nx - 3, ny - 5);
    ctx.lineTo(nx + 3, ny - 5);
    ctx.lineTo(nx + NOZZLE_W / 2, ny);
    ctx.lineTo(nx - NOZZLE_W / 2, ny);
    ctx.closePath();
    ctx.fill();
  }

  /** A hot-air balloon: a striped envelope, its skirt, the lines, and the basket; centred on the envelope. */
  private drawBalloon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const r = BALLOON_R;
    // The skirt first, so the envelope covers its top.
    const throatY = y + r + BALLOON_SKIRT;
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y + r * 0.8);
    ctx.lineTo(x + r * 0.6, y + r * 0.8);
    ctx.lineTo(x + 6, throatY);
    ctx.lineTo(x - 6, throatY);
    ctx.closePath();
    ctx.fill();
    // The envelope: stripes narrowing towards the sides, as on a sphere.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < BALLOON_STRIPES; i++) {
      const x0 = x - r * Math.cos((i * Math.PI) / BALLOON_STRIPES);
      const x1 = x - r * Math.cos(((i + 1) * Math.PI) / BALLOON_STRIPES);
      ctx.fillStyle = i % 2 === 0 ? '#f87171' : '#fde68a';
      ctx.fillRect(x0, y - r, x1 - x0, 2 * r);
    }
    // A soft shine at the top left.
    const shine = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
    shine.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    shine.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
    shine.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
    ctx.fillStyle = shine;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // The lines from the throat to the basket, and the basket.
    const basketY = throatY + BALLOON_LINES;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(x - 6, throatY);
    ctx.lineTo(x - BASKET_W / 2 + 2, basketY);
    ctx.moveTo(x + 6, throatY);
    ctx.lineTo(x + BASKET_W / 2 - 2, basketY);
    ctx.stroke();
    ctx.fillStyle = '#b45309';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - BASKET_W / 2, basketY, BASKET_W, BASKET_H, 3);
    ctx.fill();
    ctx.stroke();
  }

  /**
   * The split bridge for the car: two halves rising from the sides towards the gap in the
   * middle, like / and \, each a deck with a rail; they fade in as the flight starts and out
   * as it ends.
   */
  private drawRamps(ctx: CanvasRenderingContext2D, f: Flight, t: number): void {
    const { run, rise } = ramps(f.width);
    const roadY = f.altitude + CAR_LIFT;
    const remaining = f.crossMs + TAIL_MS - t;
    const alpha = Math.min(1, t / RAMP_FADE_MS, remaining / RAMP_FADE_MS);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.lineCap = 'butt';
    for (const side of [-1, 1]) {
      // From the canvas's edge up to the gap.
      const edgeX = side < 0 ? 0 : f.width;
      const gapX = side < 0 ? run : f.width - run;
      // Deck.
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(edgeX, roadY + rise);
      ctx.lineTo(gapX, roadY);
      ctx.stroke();
      // Road surface and its centre dashes.
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(edgeX, roadY + rise - 3);
      ctx.lineTo(gapX, roadY - 3);
      ctx.stroke();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(edgeX, roadY + rise - 3);
      ctx.lineTo(gapX, roadY - 3);
      ctx.stroke();
      ctx.setLineDash([]);
      // The torn end of the half at the gap.
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(gapX - 2, roadY - 5, 4, 10);
      // Rail: posts and a top rail along the far side.
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const x = edgeX + ((gapX - edgeX) * i) / 4;
        const y = roadY + rise * (1 - i / 4) - 3;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 10);
      }
      ctx.moveTo(edgeX, roadY + rise - 13);
      ctx.lineTo(gapX, roadY - 13);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A low, wedge-shaped hypercar facing right, with its wheels on the road `CAR_LIFT` below its centre. */
  private drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number): void {
    const l = CAR_L;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // Body.
    ctx.fillStyle = '#f43f5e';
    ctx.strokeStyle = '#881337';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-l / 2, 6);
    ctx.lineTo(-l / 2 + 2, -4);
    ctx.lineTo(-l / 4, -5);
    ctx.lineTo(-l / 8, -14);
    ctx.lineTo(l / 6, -14);
    ctx.lineTo(l / 3, -6);
    ctx.lineTo(l / 2 - 2, -2);
    ctx.lineTo(l / 2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Rear wing.
    ctx.fillStyle = '#881337';
    ctx.fillRect(-l / 2 - 4, -11, 12, 2.5);
    ctx.fillRect(-l / 2 + 2, -9, 2, 5);
    // Windows.
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(-l / 4 + 3, -5);
    ctx.lineTo(-l / 8 + 2, -12);
    ctx.lineTo(l / 6 - 2, -12);
    ctx.lineTo(l / 3 - 4, -6);
    ctx.closePath();
    ctx.fill();
    // Lights.
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(l / 2 - 7, -2, 6, 2);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-l / 2, -3, 3, 2);
    // Wheels.
    for (const wx of [-l / 3, l / 3]) {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(wx, CAR_LIFT - 6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(wx, CAR_LIFT - 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number): void {
    const s = PLANE_SIZE;
    ctx.save();
    ctx.translate(x, y);
    if (this.plane) {
      ctx.rotate(tilt + PLANE_IMAGE_ANGLE);
      ctx.scale(-1, 1);
      ctx.drawImage(this.plane, -s / 2, -s / 2, s, s);
    } else {
      // A paper dart pointing right, until the image is here.
      ctx.rotate(tilt);
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(s / 2, 0);
      ctx.lineTo(-s / 2, -s / 4);
      ctx.lineTo(-s / 4, 0);
      ctx.lineTo(-s / 2, s / 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
