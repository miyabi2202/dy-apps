import type { Scoop } from '../core/protocol';
import { type Course, type Craft, OVERSHOOT, type World } from './crafts/craft';
import { HotAirBalloon } from './crafts/hot-air-balloon';
import { Hypercar } from './crafts/hypercar';
import { PaperPlane } from './crafts/paper-plane';
import { drawSuction, drawVacuum, TIE_TO_NOZZLE, vacuumAt } from './vacuum';

/** What the flights ask of the engine, through the worker; `PileClient` is one. */
export interface FlightSink {
  /** Icons in the pile right now, moving, resting or held. */
  alive(): number;
  /** Drop `count` more icons in. */
  add(count: number): void;
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

/** Where icon `id` is now and whether it is at rest, or null if the renderer doesn't have it. */
export type Peek = (id: number) => { x: number; y: number; resting: boolean } | null;

/** What the flights need from the renderer while drawing. */
export interface Hooks {
  stamp: Stamp;
  take: Take;
  peek: Peek;
}

/** The bin, in world pixels: a dropped icon whose centre comes within `half` of (x, y) is caught. */
export interface BinTarget {
  x: number;
  y: number;
  half: number;
  /** Called each time the bin catches one. */
  onCatch?: () => void;
}

interface Options {
  /** Random numbers in [0, 1). */
  rng?: () => number;
  /** The crafts to pick from; one of each unless given. */
  crafts?: readonly Craft[];
}

/** One of every craft. */
export const allCrafts = (): Craft[] => [new PaperPlane(), new HotAirBalloon(), new Hypercar()];

/** The most icons one craft carries; any more asked for go at once, without a flight. */
export const VACUUM_CAPACITY = 2000;
/** The vacuum takes this many times the number asked for, and drops this share of what it took. */
const TAKE_SHARE = 1.25;
const DROP_SHARE = 0.5;

// Timing, in ms, and geometry, in world (CSS) pixels.
/** After a craft has crossed, it carries on out of sight for this long, while the last icons are drawn in. */
const TAIL_MS = 700;
/** The next queued craft sets off this long after the one before is gone, so two are never up at once. */
const QUEUE_GAP_MS = 1000;
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
/** A dropped icon the renderer can't find yet is given this long to show up in a frame before it is forgotten. */
const FALLING_GRACE_MS = 500;
/** When the extras are spat back out, as fractions of the crossing. */
const DROP_FROM = 0.3;
const DROP_TO = 0.8;

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

/** Where an icon is in its flight. */
const WAITING = 0; // still in the pile, drawn by the renderer
const LIFTING = 1; // grabbed, on its way into the nozzle
const INSIDE = 2; // in the canister
const DROPPED = 3; // spat back out, the engine's again

interface Flight {
  t0: number;
  craft: Craft;
  course: Course;
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
 * The flights that carry removed icons away. A craft, picked at random (see `crafts/`),
 * enters at the left towing a vacuum cleaner on a rope and crosses just above the pile. The
 * icons a flight is to take are set aside in the engine but stay in the pile until the
 * nozzle comes near each; then it is grabbed and sucked up, swinging and shrinking on the
 * way, and whatever rested on it falls as it goes. The vacuum takes a quarter more than
 * asked for and spits half of what it took back out over the pile (see `planRemoval`);
 * a dropped icon that falls into the bin is destroyed too, so the user can move the bin to
 * catch them. When the craft is out of sight, what it still holds is destroyed.
 *
 * Presses queue, in order: a removal's craft sets off a little after the one before is gone,
 * so quick repeated presses send crafts one after another, never two at once, and an
 * addition waits for any craft that is up, so icons don't rain down through a removal.
 * Every icon a flight takes ends up released or destroyed: on the tick the craft is gone,
 * and at once on `reset()`, since the engine has already let go of everything then.
 */
export class VacuumFlights {
  private flights: Flight[] = [];
  private readonly queue: Action[] = [];
  /** A scoop has been asked for and its icons haven't come back in a frame yet. */
  private awaiting = false;
  /** When the last flight ended, for the gap before the next. */
  private lastEnded = -Infinity;
  /** Every icon in a flight, waiting, lifting or inside. */
  private readonly inFlight = new Set<number>();
  /** Icons spat out and still falling, which the bin may catch, and when each was dropped. */
  private readonly falling = new Map<number, number>();
  private bin: BinTarget | null = null;
  private readonly rng: () => number;
  private readonly crafts: readonly Craft[];
  /** The crafts still to go in this round (see `nextCraft`), and the one that went last. */
  private bag: Craft[] = [];
  private lastCraft: Craft | null = null;

  constructor(
    private readonly sink: FlightSink,
    { rng = Math.random, crafts = allCrafts() }: Options = {},
  ) {
    this.rng = rng;
    this.crafts = crafts;
  }

  /** Flights in the air. */
  get count(): number {
    return this.flights.length;
  }

  /** Presses waiting their turn. */
  get queued(): number {
    return this.queue.length;
  }

  /** Icons asked for but still waiting on a craft to be gone before they drop in. */
  get pendingAdds(): number {
    let n = 0;
    for (const action of this.queue) if (action.kind === 'add') n += action.count;
    return n;
  }

  /** Icon `id` belongs to a flight, so the user can't pick it up. */
  holds(id: number): boolean {
    return this.inFlight.has(id);
  }

  /** Where the bin is, for catching dropped icons; null while there is none. */
  setBin(bin: BinTarget | null): void {
    this.bin = bin;
  }

  /** Add `count` icons, at wall time `now`: at once, or after any craft that is up is gone. */
  add(count: number, now: number): void {
    if (count <= 0) return;
    this.queue.push({ kind: 'add', count });
    this.launch(now);
  }

  /**
   * Remove `count` icons, at wall time `now`: when its turn comes, a craft takes what
   * `planRemoval` says from the pile as it is then, and the rest over a load goes at once.
   */
  remove(count: number, now: number): void {
    if (count <= 0) return;
    this.queue.push({ kind: 'remove', count });
    this.launch(now);
  }

  /** The engine let everything go (a clear or resize): nothing is left to fly or to remove. */
  reset(): void {
    this.flights = [];
    this.queue.length = 0;
    this.awaiting = false;
    this.lastEnded = -Infinity;
    this.inFlight.clear();
    this.falling.clear();
  }

  /** The icons the engine set aside for the next craft have arrived: it sets off at wall time `now`. */
  start(scoop: Scoop, world: World, now: number): void {
    this.awaiting = false;
    const n = scoop.ids.length;
    if (n === 0) return;
    const { rng } = this;
    let top = Infinity;
    for (let k = 0; k < n; k++) top = Math.min(top, scoop.xy[2 * k + 1]!);
    const craft = this.nextCraft();
    // From the craft's centre down to the nozzle, and how far it dips below its altitude.
    const toNozzle = craft.tie.dy + TIE_TO_NOZZLE;
    const sag = craft.sag(world);
    const altitude = Math.min(
      Math.max(craft.minY(world), top - NOZZLE_CLEARANCE - toNozzle - sag),
      world.height - toNozzle - sag,
    );
    const course: Course = { ...world, altitude, crossMs: craft.crossMs };
    const startX = -OVERSHOOT;
    const speed = (world.width + 2 * OVERSHOOT) / craft.crossMs;

    const flight: Flight = {
      t0: now,
      craft,
      course,
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
      // The nozzle trails the craft a little, so it reaches the icon after the craft does.
      flight.liftAt[k] = now + Math.max(0, (x - REACH - startX) / speed) + rng() * JITTER_MS;
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
        const when = now + craft.crossMs * (DROP_FROM + (DROP_TO - DROP_FROM) * rng());
        flight.drops.push({ k, at: Math.max(inside, Math.min(when, lastOver)) });
      }
      flight.drops.sort((a, b) => a.at - b.at);
    }
    this.flights.push(flight);
  }

  /**
   * The craft for the next flight, from a shuffle bag: every craft goes once, in a random
   * order, before any goes again, so they come up as often as each other even over a few
   * flights, and the same one never goes twice running when there is a choice.
   */
  private nextCraft(): Craft {
    if (this.bag.length === 0) {
      const bag = [...this.crafts];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      // The next to go is the last in the bag; not the one that just went, if it can be helped.
      const last = bag.length - 1;
      if (bag.length > 1 && bag[last] === this.lastCraft) {
        const j = Math.floor(this.rng() * last);
        [bag[last], bag[j]] = [bag[j]!, bag[last]];
      }
      this.bag = bag;
    }
    const craft = this.bag.pop() ?? allCrafts()[0]!;
    this.lastCraft = craft;
    return craft;
  }

  /**
   * Draw every flight as of wall time `now`, taking icons as the suction reaches them,
   * dropping and destroying them when their time has come, and working through the queue
   * when nothing is up.
   */
  draw(ctx: CanvasRenderingContext2D, now: number, hooks: Hooks): void {
    this.catchFalling(hooks.peek, now);
    this.flights = this.flights.filter((flight) => {
      if (now >= flight.t0 + flight.course.crossMs + TAIL_MS) {
        flight.ids.forEach((id, k) => {
          if (flight.stage[k] === DROPPED) return;
          // One the suction never reached (the tab was hidden) still goes with the craft.
          if (flight.stage[k] === WAITING) this.takeIcon(flight, k, hooks.take);
          this.sink.destroy(id);
          this.inFlight.delete(id);
        });
        this.lastEnded = now;
        return false;
      }
      this.drawFlight(ctx, flight, now, hooks);
      return true;
    });
    this.launch(now);
  }

  /**
   * Dropped icons that fall into the bin are destroyed; ones that land are forgotten, as are
   * ones the renderer hasn't seen for a while (destroyed some other way). A just-dropped icon
   * isn't in a frame until the engine has let it go, so it gets a moment to show up.
   */
  private catchFalling(peek: Peek, now: number): void {
    if (this.falling.size === 0) return;
    const { bin } = this;
    for (const [id, since] of this.falling) {
      const at = peek(id);
      if (!at) {
        if (now - since > FALLING_GRACE_MS) this.falling.delete(id);
        continue;
      }
      if (at.resting) {
        if (now - since > FALLING_GRACE_MS) this.falling.delete(id);
        continue;
      }
      if (bin && Math.abs(at.x - bin.x) <= bin.half && Math.abs(at.y - bin.y) <= bin.half) {
        this.falling.delete(id);
        this.sink.grab(id);
        this.sink.destroy(id);
        bin.onCatch?.();
      }
    }
  }

  /**
   * Work through the queue while nothing is up: additions go at once; a removal's craft
   * sets off once the last has been gone long enough, and nothing more until it is gone too.
   */
  private launch(now: number): void {
    while (!this.awaiting && this.flights.length === 0) {
      const next = this.queue[0];
      if (!next) return;
      if (next.kind === 'add') {
        this.queue.shift();
        this.sink.add(next.count);
        continue;
      }
      if (now - this.lastEnded < QUEUE_GAP_MS) return;
      this.queue.shift();
      const { fly, drop, instant } = planRemoval(next.count, this.sink.alive());
      if (instant > 0) this.sink.remove(instant);
      if (fly === 0) continue;
      this.awaiting = true;
      this.sink.scoop(fly, drop);
    }
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

  private drawFlight(ctx: CanvasRenderingContext2D, f: Flight, now: number, hooks: Hooks): void {
    const { stamp, take } = hooks;
    const { craft, course } = f;
    const t = now - f.t0;
    const px = f.startX + f.speed * t;
    const { py, tilt } = craft.pathAt(course, px, t);
    const tieX = px + craft.tie.dx;
    const tieY = py + craft.tie.dy;
    const vacuum = vacuumAt(tieX, tieY, t);

    // Extras whose moment has come are spat out of the back of the canister.
    while (f.drops.length > 0 && f.drops[0]!.at <= now) {
      const { k } = f.drops.shift()!;
      if (f.stage[k] === DROPPED) continue;
      if (f.stage[k] === WAITING) this.takeIcon(f, k, take);
      f.stage[k] = DROPPED;
      this.inFlight.delete(f.ids[k]!);
      this.falling.set(f.ids[k]!, now);
      this.sink.release(f.ids[k]!, vacuum.exhaustX, vacuum.exhaustY);
    }

    craft.drawScene?.(ctx, course, t, course.crossMs + TAIL_MS - t);
    drawSuction(ctx, vacuum, now);
    drawVacuum(ctx, tieX, tieY, vacuum, f.inside / f.ids.length);
    craft.draw(ctx, px, py, tilt);

    // Icons the suction has reached: swinging up into the nozzle, or counted inside.
    const { nx, ny } = vacuum;
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
}
