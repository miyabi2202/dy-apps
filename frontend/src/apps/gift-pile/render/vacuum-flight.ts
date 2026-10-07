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

interface Options {
  /** Random numbers in [0, 1). */
  rng?: () => number;
}

/** The most icons one plane carries; any more asked for go at once, without a flight. */
export const VACUUM_CAPACITY = 2000;
/** How many icons over the number asked for the vacuum takes, to spit back out on the way. */
const EXTRA_SHARE = 0.12;
const EXTRA_MAX = 12;

// Timing, in ms, and geometry, in world (CSS) pixels.
/** The plane crosses from off the left edge to off the right edge in this long. */
const FLY_MS = 2400;
/** Then flies on out of sight for this long, while the last icons are drawn in. */
const TAIL_MS = 700;
/** The next queued plane may set off once the one before is this far across. */
const NEXT_AFTER = 0.55;
/** How far outside the canvas the plane starts and finishes. */
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
/** The plane flies this far above the highest icon it takes, but never nearer the top than this. */
const CLEARANCE = 100;
const ALTITUDE_MIN = 44;
/** Where the plane starts to climb away, as a fraction of the width, and by how much. */
const CLIMB_FROM = 0.7;
const CLIMB = 90;
const PLANE_SIZE = 72;
/**
 * The paper plane image is mirrored, so its long wedge leads and the keel's fold trails like
 * a tail fin; mirrored it points up and to the right, and turned this far its nose is a
 * little up.
 */
const PLANE_IMAGE_ANGLE = 0.19;
/** The rope from the plane to the canister, and how far behind the plane the canister trails. */
const ROPE = 30;
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
  /** The canvas's width when the flight began. */
  width: number;
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

/**
 * The flights that carry removed icons away. A paper plane enters at the top left towing a
 * vacuum cleaner on a rope, flies across just above the pile and climbs away at the top
 * right. The icons it is to take are set aside in the engine but stay in the pile until the
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
  /** Every icon in a flight, waiting, lifting or inside. */
  private readonly inFlight = new Set<number>();
  private plane: HTMLImageElement | null = null;
  private readonly rng: () => number;

  constructor(
    private readonly sink: FlightSink,
    { rng = Math.random }: Options = {},
  ) {
    this.rng = rng;
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
    const lowest = world.height - ROPE - BODY_H - NOZZLE_DROP;
    const altitude = Math.min(Math.max(ALTITUDE_MIN, top - CLEARANCE), lowest);
    const startX = -OVERSHOOT;
    const speed = (world.width + 2 * OVERSHOOT) / FLY_MS;

    const flight: Flight = {
      t0: now,
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
    const nozzleY = altitude + ROPE + BODY_H / 2 + NOZZLE_DROP;
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
        const when = now + FLY_MS * (DROP_FROM + (DROP_TO - DROP_FROM) * rng());
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
      if (now >= flight.t0 + FLY_MS + TAIL_MS) {
        flight.ids.forEach((id, k) => {
          if (flight.stage[k] === DROPPED) return;
          // One the suction never reached (the tab was hidden) still goes with the plane.
          if (flight.stage[k] === WAITING) this.takeIcon(flight, k, take);
          this.sink.destroy(id);
          this.inFlight.delete(id);
        });
        return false;
      }
      this.drawFlight(ctx, flight, now, stamp, take);
      return true;
    });
    this.launch(now);
  }

  /** Send the next queued plane off, if none is going or the last is far enough across. */
  private launch(now: number): void {
    if (this.awaiting || this.queue.length === 0) return;
    const last = this.flights[this.flights.length - 1];
    if (last && now - last.t0 < FLY_MS * NEXT_AFTER) return;
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

  private drawFlight(
    ctx: CanvasRenderingContext2D,
    f: Flight,
    now: number,
    stamp: Stamp,
    take: Take,
  ): void {
    const t = now - f.t0;
    const px = f.startX + f.speed * t;
    // Level, then climbing away along a parabola; the plane points along it.
    const climbRun = (1 - CLIMB_FROM) * f.width + OVERSHOOT;
    const over = (px - CLIMB_FROM * f.width) / climbRun;
    const climb = over > 0 ? over * over * CLIMB : 0;
    const tilt = over > 0 ? -Math.atan((2 * over * CLIMB) / climbRun) : 0;
    const py = f.altitude - climb + Math.sin(t / 160) * 2;
    // The canister swings on its rope behind the plane; the nozzle hangs below it.
    const cx = px - TRAIL + Math.sin(t / 310) * 3;
    const cy = py + ROPE + BODY_H / 2;
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

    this.drawSuction(ctx, nx, ny, now);
    this.drawVacuum(ctx, px, py, cx, cy, nx, ny, f.inside / f.ids.length);
    this.drawPlane(ctx, px, py, tilt);

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

  /** The rope, the canister with its gauge of what it holds, the hose and the nozzle. */
  private drawVacuum(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
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
    ctx.moveTo(px - 5, py + 13);
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
