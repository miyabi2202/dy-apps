import {
  type Board,
  type Gfx,
  pick,
  type Removal,
  type Remover,
  type ScoopShape,
  type SpriteSource,
} from '../board';
import { BANG } from './bang';
import { pusherPortrait } from './portrait';
import {
  bodyToWorld,
  bowing,
  bracing,
  BROW,
  drawPusher,
  pointing,
  PUSHER,
  PUSHER_HAPPY,
  type PusherPose,
  shoving,
  standing,
  wiping,
} from './pusher';
import { SUBWAY_SHADERS } from './shader';
import {
  bulged,
  CAR_HALF,
  type CarLook,
  carSlots,
  DOOR_HALF,
  DOOR_TOP,
  drawCarBody,
  drawCarInterior,
  drawCarUnder,
  drawTrack,
  FLOOR,
  LIVERIES,
  type Livery,
  RAIL,
  ROOF,
  type Slot,
} from './train';
import { easeOut, smooth } from '../kit/easing';
import { clumpOf, clumpSomewhere } from '../kit/clump';
import { Frames } from '../kit/clock';
import { Emitter } from '../kit/particles';

// Timing in ms; geometry in world pixels, or in the car's units where it says so (see `train.ts`).
/** The car is this long on a canvas this wide, within these bounds. */
const CAR_SHARE = 0.76;
const CAR_MIN = 230;
const CAR_MAX = 380;
/** The track and platform fade in over this long, and everything fades out over this long at the end. */
const FADE_IN_MS = 300;
const FADE_OUT_MS = 400;
/** The car glides in and stops over this long, and the doors take this long to slide open. */
const ARRIVE_MS = 1700;
const OPEN_MS = 340;
/** Boarding starts then; the last icon is on board this long after for one icon, and up to this much later for a full load. */
const BOARD_FROM = ARRIVE_MS + OPEN_MS + 80;
const BOARD_MIN_MS = 1500;
const BOARD_MORE_MS = 1100;
/** An icon's hop from the pile to the door: a base plus a bit per pixel, at most this long. */
const HOP_MIN_MS = 360;
const HOP_PER_PX = 0.5;
const HOP_MAX_MS = 760;
/** How long an icon stands in the crowd at the door before it is shoved in, at most and at least. */
const DWELL_MAX_MS = 420;
const DWELL_MIN_MS = 40;
/** About how many stand in the crowd at once. */
const CROWD = 14;
/** How long an icon takes to disappear into the car once shoved. */
const PUSH_IN_MS = 170;
/** How long between the pusher's shoves while boarding, for one icon and for a full load. */
const SHOVE_SLOW_MS = 430;
const SHOVE_FAST_MS = 260;
/** Each try at closing the doors: they close onto the jam, stick, bounce back open, and rest. */
const CLOSE_MS = 240;
const STUCK_MS = 170;
const BOUNCE_MS = 240;
const REST_MS = 190;
const JAM_MS = CLOSE_MS + STUCK_MS + BOUNCE_MS + REST_MS;
/** How far open the doors stick at on each try, and how far they bounce back. */
const STUCK_AT = [0.36, 0.3, 0.24];
const BOUNCED = 0.72;
/** The pusher's last heave, and the slam. */
const HEAVE_MS = 320;
const SLAM_MS = 110;
/** After the slam the train waits this long, then pulls away over this long. */
const HOLD_MS = 650;
const DEPART_MS = 1500;
/** Duds popped out of the door fall this fast, px/s², and are let go once they are this far below the floor. */
const DUD_GRAVITY = 1500;
const DUD_BELOW = 14;
/** Where the car can stop with its door over the pile, as fractions of the canvas's width. */
const AIM_FROM = 0.25;
const AIM_TO = 0.8;

/** The 'loaded' share of a removal of `n` icons: 0 for one, 1 for the most a removal carries. */
function loadOf(n: number): number {
  return Math.min(1, Math.log10(Math.max(1, n)) / 3.3);
}

/** Fast to start and overshooting a little before it settles at 1. */
function backOut(u: number): number {
  const c = Math.min(1, Math.max(0, u)) - 1;
  return 1 + c * c * (2.7 * c + 1.7);
}

interface Options {
  /** The liveries to pick from for each train; the first until the first pick. */
  liveries?: readonly Livery[];
}

/**
 * Rush hour on the subway: a train glides in along a rail just above the pile and stops with a
 * hiss, its doors sliding open over a clump of it. A white-gloved platform pusher shoves the
 * icons, hopping up from the pile, into the packed car, until its windows are full of squashed
 * faces. The doors try to close and jam on them, bounce open and try again, the pusher putting
 * his back into it, and the duds are squeezed out and fall back onto the pile. At last the doors
 * slam shut, the train pulls away, and the pusher wipes his brow and bows.
 */
export class Subway implements Remover {
  readonly name = 'subway';
  /** Compiled when the page opens. */
  readonly shaders = SUBWAY_SHADERS;
  /** The pusher, the slam's burst and his cut-in portraits, painted ahead of time. */
  readonly sprites: readonly SpriteSource[];
  private readonly liveries: readonly Livery[];

  constructor({ liveries = LIVERIES }: Options = {}) {
    this.liveries = liveries;
    this.sprites = [PUSHER, PUSHER_HAPPY, BANG, ...liveries.map(pusherPortrait)];
  }

  /** A clump of the pile somewhere across it. */
  shape(rng: () => number): ScoopShape {
    return clumpSomewhere(rng, AIM_FROM, AIM_TO);
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new RushHour(board, now, rng, pick(this.liveries, rng));
  }
}

/** One frame's icons in each layer, gathered so each layer is drawn in one go: x, y, then two more numbers each. */
class Layer {
  readonly data: Float32Array;
  count = 0;

  constructor(n: number) {
    this.data = new Float32Array(n * 4);
  }

  add(x: number, y: number, a: number, b: number): void {
    const at = this.count++ * 4;
    this.data[at] = x;
    this.data[at + 1] = y;
    this.data[at + 2] = a;
    this.data[at + 3] = b;
  }
}

/** One train. */
class RushHour implements Removal {
  private readonly t0: number;
  /** World px per unit of the car. */
  private readonly scale: number;
  /** Where the car stops (its middle, which is the door's), and its origin's height. */
  private readonly doorX: number;
  private readonly carY: number;
  /** The car's floor and the top of the rail, in the world. */
  private readonly floorY: number;
  private readonly railY: number;
  /** Where the car starts, off to the left, and how fast it pulls away (px/ms²). */
  private readonly startX: number;
  private readonly pullAway: number;
  /** Where the pusher stands, between his feet. */
  private readonly pusherX: number;
  /** When each part ends, in ms after `t0`. */
  private readonly boardEnd: number;
  private readonly tries: number;
  private readonly heaveAt: number;
  private readonly slamAt: number;
  private readonly departAt: number;
  private readonly goneAt: number;
  private readonly done: number;
  /** How long between shoves while boarding. */
  private readonly shoveMs: number;
  /** Each icon: where it hops from, when, for how long, where in the crowd it stands (car units from the door), when it is shoved in, and a seed. */
  private readonly fromX: Float32Array;
  private readonly fromY: Float32Array;
  private readonly hopAt: Float32Array;
  private readonly hopMs: Float32Array;
  private readonly spotX: Float32Array;
  private readonly spotY: Float32Array;
  private readonly inAt: Float32Array;
  private readonly seed: Float32Array;
  /** The duds: when each is popped out of the door, how fast, and when it is let go below the floor. */
  private readonly dud: Uint8Array;
  private readonly popAt: Float32Array;
  private readonly popVx: Float32Array;
  private readonly popVy: Float32Array;
  private readonly popX: Float32Array;
  private readonly popY: Float32Array;
  private readonly landAt: Float32Array;
  private readonly taken: Uint8Array;
  private readonly finished: Uint8Array;
  /** Where passengers show through the glass. */
  private readonly slots: readonly Slot[];
  /** How many icons are on board, as of the last frame. */
  private inside = 0;
  private readonly hopping: Layer;
  private readonly crowd: Layer;
  private readonly entering: Layer;
  private readonly flying: Layer;
  private readonly steam: Emitter;
  private readonly sparks: Emitter;
  private readonly sweat: Emitter;
  private readonly rng: () => number;
  private readonly frames = new Frames();
  /** One-off moments that have happened. */
  private stopped = false;
  private introduced = false;
  private readonly jolted: boolean[] = [];
  private slammed = false;
  private wiped = false;
  private gone = false;

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    private readonly livery: Livery,
  ) {
    const { icons, world, iconRadius: r, camera } = board;
    const n = icons.length;
    this.rng = rng;
    this.t0 = now;
    const length = Math.min(CAR_MAX, Math.max(CAR_MIN, world.width * CAR_SHARE));
    const s = length / (2 * CAR_HALF);
    this.scale = s;

    // The door stops over the clump, with room for the pusher to its left.
    const clump = clumpOf(icons, world, 40);
    this.doorX = Math.min(world.width - 40 * s, Math.max(80 * s, clump.x));
    // The rail runs just above the highest of the pile across the canvas, but the car stays on screen.
    let highest = clump.top;
    for (let x = 0; x <= world.width; x += 12) {
      const top = board.topAt(x);
      if (top !== null) highest = Math.min(highest, top);
    }
    const view = camera.view;
    this.railY = Math.max(
      view.top + 14 + (RAIL - ROOF + 10) * s,
      Math.min(highest - r - 3, world.height - 6),
    );
    this.carY = this.railY - RAIL * s;
    this.floorY = this.carY + FLOOR * s;
    this.startX = -(CAR_HALF + 30) * s;
    this.pusherX = this.doorX - (DOOR_HALF + 27) * s;
    this.pullAway =
      (2 * (world.width + (CAR_HALF + 40) * s - this.doorX)) / (DEPART_MS * DEPART_MS);

    // Boarding: the icons nearest the door first, more of them at once the more there are.
    const load = loadOf(n);
    const boardMs = BOARD_MIN_MS + BOARD_MORE_MS * load;
    this.shoveMs = SHOVE_SLOW_MS + (SHOVE_FAST_MS - SHOVE_SLOW_MS) * load;
    const spread = Math.max(250, boardMs - HOP_MAX_MS - DWELL_MAX_MS * 0.5);
    const dwell = Math.min(DWELL_MAX_MS, Math.max(DWELL_MIN_MS, (CROWD * spread) / Math.max(1, n)));
    this.fromX = new Float32Array(n);
    this.fromY = new Float32Array(n);
    this.hopAt = new Float32Array(n);
    this.hopMs = new Float32Array(n);
    this.spotX = new Float32Array(n);
    this.spotY = new Float32Array(n);
    this.inAt = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.dud = new Uint8Array(n);
    this.popAt = new Float32Array(n);
    this.popVx = new Float32Array(n);
    this.popVy = new Float32Array(n);
    this.popX = new Float32Array(n);
    this.popY = new Float32Array(n);
    this.landAt = new Float32Array(n);
    this.taken = new Uint8Array(n);
    this.finished = new Uint8Array(n);
    const near = icons.map((p) => Math.abs(p.x - this.doorX) + 40 * rng());
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => near[a]! - near[b]!);
    let boardEnd = BOARD_FROM;
    order.forEach((i, rank) => {
      const p = icons[i]!;
      this.fromX[i] = p.x;
      this.fromY[i] = p.y;
      // Packed into the doorway, most at the bottom, bulging out towards the pusher.
      this.spotX[i] = -17 + 30 * rng();
      this.spotY[i] = FLOOR - 8 - 42 * rng() ** 1.4;
      const sx = this.doorX + this.spotX[i] * s;
      const sy = this.floorY + (this.spotY[i] - FLOOR) * s;
      const hop = Math.min(HOP_MAX_MS, HOP_MIN_MS + HOP_PER_PX * Math.hypot(sx - p.x, sy - p.y));
      this.hopAt[i] = BOARD_FROM + (spread * rank) / Math.max(1, n) + 60 * rng();
      this.hopMs[i] = hop;
      this.inAt[i] = this.hopAt[i] + hop + dwell * (0.6 + 0.8 * rng());
      this.seed[i] = rng() * 40;
      boardEnd = Math.max(boardEnd, this.inAt[i] + PUSH_IN_MS);
    });
    this.boardEnd = boardEnd + 120;

    // The doors try to close once, twice or three times, and each time the duds are squeezed out.
    this.tries = n >= 30 ? 3 : n >= 3 ? 2 : 1;
    this.heaveAt = this.boardEnd + this.tries * JAM_MS;
    this.slamAt = this.heaveAt + HEAVE_MS + SLAM_MS;
    this.departAt = this.slamAt + HOLD_MS;
    this.goneAt = this.departAt + DEPART_MS;
    this.done = this.goneAt + FADE_OUT_MS;
    const drops = board.dropCount;
    for (let k = 0; k < drops; k++) {
      const i = order[Math.floor((k * n) / drops)]!;
      this.dud[i] = 1;
      const attempt = k % this.tries;
      this.popAt[i] = this.boardEnd + attempt * JAM_MS + CLOSE_MS + STUCK_MS + rng() * BOUNCE_MS;
      this.popX[i] = this.doorX + (rng() - 0.5) * 6 * s;
      this.popY[i] = this.floorY + (-50 * rng() - 6) * s;
      let vx = (rng() < 0.5 ? -1 : 1) * (70 + 190 * rng());
      const vy = -(220 + 220 * rng());
      // Let go once it has fallen past the floor, by when it is moving down.
      const drop = this.floorY + DUD_BELOW * s + r - this.popY[i];
      const flight = (-vy + Math.sqrt(vy * vy + 2 * DUD_GRAVITY * drop)) / DUD_GRAVITY;
      // Kept on the canvas: one that would land off it goes the other way.
      const landX = this.popX[i] + vx * flight;
      if (landX < r || landX > world.width - r) vx = -vx;
      const back = this.popX[i] + vx * flight;
      if (back < r || back > world.width - r) vx = 0;
      this.popVx[i] = vx;
      this.popVy[i] = vy;
      this.landAt[i] = this.popAt[i] + flight * 1000;
    }

    this.slots = carSlots((r * 1.25) / s, rng);
    this.hopping = new Layer(n);
    this.crowd = new Layer(n);
    this.entering = new Layer(n);
    this.flying = new Layer(n);
    this.steam = new Emitter(
      {
        capacity: 220,
        blend: 'normal',
        colorFrom: 'rgba(245, 248, 252, 0.7)',
        drag: 2.2,
        gravity: -40,
        sizeOverLife: (u) => 0.5 + 1.3 * u,
        alphaOverLife: (u) => (1 - u) * (1 - u),
      },
      rng,
    );
    this.sparks = new Emitter(
      { capacity: 220, shape: 'spark', colorFrom: '#fff6c2', colorTo: '#ff7a1a', gravity: 600 },
      rng,
    );
    this.sweat = new Emitter(
      {
        capacity: 60,
        blend: 'normal',
        colorFrom: '#9ad7ff',
        gravity: 520,
        sizeOverLife: () => 1,
        alphaOverLife: (u) => 1 - u * u,
      },
      rng,
    );
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  draw(gfx: Gfx, now: number): void {
    const t = now - this.t0;
    const { board, scale: s } = this;
    const dt = this.frames.dt(now);
    const fade = smooth(t / FADE_IN_MS) * (1 - smooth((t - this.goneAt) / FADE_OUT_MS));

    this.moments(t);
    this.moveIcons(t);
    // Once the train is out of sight, everyone on it is gone.
    if (!this.gone && t >= this.goneAt) {
      this.gone = true;
      for (let i = 0; i < board.icons.length; i++) {
        if (!this.finished[i]) {
          this.finished[i] = 1;
          board.destroy(i);
        }
      }
    }

    const car = this.carAt(t);
    const shoved = this.shoveAt(t);
    drawTrack(gfx, board.world.width, this.railY, s, fade);
    if (!this.gone) {
      this.drawWind(gfx, t, car);
      drawCarUnder(gfx, car);
      drawCarInterior(gfx, car);
      this.drawPassengers(gfx, t, car, shoved);
      drawCarBody(gfx, car);
    }
    this.effects(t, dt, car);
    this.steam.step(dt);
    this.steam.draw(gfx);
    this.sparks.step(dt);
    this.sparks.draw(gfx);
    this.drawPlatform(gfx, fade);
    this.drawCrowd(gfx, shoved);
    this.drawJam(gfx, t, car);
    const pose = this.poseAt(t, shoved);
    drawPusher(gfx, this.pusherX, this.floorY, s, pose, fade);
    this.drawFlying(gfx);
    this.sweat.step(dt);
    this.sweat.draw(gfx);
    this.drawBang(gfx, t);
  }

  /** The screen's reactions, each once: the stop, the cut-in, each jam, the slam. */
  private moments(t: number): void {
    const { fx } = this.board;
    if (!this.stopped && t >= ARRIVE_MS) {
      this.stopped = true;
      fx.shake(2, 220);
    }
    // As the pusher sets to work, the cut-in.
    if (!this.introduced && t >= BOARD_FROM) {
      this.introduced = true;
      fx.cutIn({ name: 'subway', color: this.livery.line, portrait: pusherPortrait(this.livery) });
    }
    for (let k = 0; k < this.tries; k++) {
      if (!this.jolted[k] && t >= this.boardEnd + k * JAM_MS + CLOSE_MS) {
        this.jolted[k] = true;
        fx.shake(3, 180);
      }
    }
    if (!this.slammed && t >= this.slamAt) {
      this.slammed = true;
      fx.shake(9, 480);
      fx.hitStop(90);
    }
  }

  /** Takes each icon as its hop begins, lets the duds go once they have fallen past the floor, and sorts the rest into this frame's layers. */
  private moveIcons(t: number): void {
    const { board, scale: s } = this;
    const n = board.icons.length;
    this.hopping.count = 0;
    this.crowd.count = 0;
    this.entering.count = 0;
    this.flying.count = 0;
    let inside = 0;
    for (let i = 0; i < n; i++) {
      if (this.finished[i] || t < this.hopAt[i]!) continue;
      if (!this.taken[i]) {
        this.taken[i] = 1;
        const at = board.take(i);
        if (at) {
          this.fromX[i] = at.x;
          this.fromY[i] = at.y;
        }
      }
      if (this.dud[i] && t >= this.popAt[i]!) {
        // Squeezed out of the door: flying, or let go below the floor.
        const tau = (Math.min(t, this.landAt[i]!) - this.popAt[i]!) / 1000;
        const x = this.popX[i]! + this.popVx[i]! * tau;
        const y = this.popY[i]! + this.popVy[i]! * tau + 0.5 * DUD_GRAVITY * tau * tau;
        if (t >= this.landAt[i]!) {
          this.finished[i] = 1;
          board.drop(i, x, y, this.popVx[i], this.popVy[i]! + DUD_GRAVITY * tau);
          continue;
        }
        this.flying.add(x, y, (this.seed[i]! > 20 ? 1 : -1) * tau * 9, 1);
        continue;
      }
      const hopEnd = this.hopAt[i]! + this.hopMs[i]!;
      const sx = this.doorX + this.spotX[i]! * s;
      const sy = this.floorY + (this.spotY[i]! - FLOOR) * s;
      if (t < hopEnd) {
        // Hopping up from the pile to the door, in an arc.
        const u = (t - this.hopAt[i]!) / this.hopMs[i]!;
        const e = smooth(u);
        const fx = this.fromX[i]!;
        const fy = this.fromY[i]!;
        const lift = 30 + 0.25 * Math.abs(sy - fy);
        const x = fx + (sx - fx) * e;
        const y = fy + (sy - fy) * u - lift * 4 * u * (1 - u);
        this.hopping.add(x, y, (this.seed[i]! - 20) * 0.03 * u, 1);
        continue;
      }
      if (t < this.inAt[i]!) {
        this.crowd.add(sx, sy, this.seed[i]!, Math.min(1, (t - hopEnd) / 120));
        continue;
      }
      const v = (t - this.inAt[i]!) / PUSH_IN_MS;
      if (v < 1) {
        // Shoved in: squeezing deeper into the doorway, out of sight.
        this.entering.add(sx + 6 * s * v, sy - 2 * s * v, 1 - 0.35 * v, 1 - v);
        continue;
      }
      inside++;
    }
    this.inside = inside;
  }

  /** Where the car is and how it looks at `t`. */
  private carAt(t: number): CarLook {
    const { board, scale: s } = this;
    const n = Math.max(1, board.icons.length);
    const full = this.inside / n;
    let x: number;
    if (t < ARRIVE_MS) {
      // Gliding in, braking evenly to a stop.
      const u = t / ARRIVE_MS;
      x = this.startX + (this.doorX - this.startX) * (1 - (1 - u) * (1 - u));
    } else if (t < this.departAt) {
      x = this.doorX;
    } else {
      const since = t - this.departAt;
      x = this.doorX + 0.5 * this.pullAway * since * since;
    }
    // It rocks on its springs as it stops, as the doors slam, and with each shove.
    const settle =
      t >= ARRIVE_MS ? Math.exp(-(t - ARRIVE_MS) / 160) * Math.sin((t - ARRIVE_MS) / 45) : 0;
    const slam =
      t >= this.slamAt ? Math.exp(-(t - this.slamAt) / 140) * Math.sin((t - this.slamAt) / 30) : 0;
    const shove = t >= BOARD_FROM && t < this.slamAt ? this.shoveAt(t) * full : 0;
    const press = Math.pow(full, 0.7);
    return {
      x,
      y: this.carY,
      scale: s,
      sag: 5 * press + 1.5 * settle + 2 * slam + 0.6 * shove,
      open: this.openAt(t),
      bulge: 0.1 * press + 0.03 * shove + this.strainAt(t) * 0.05 * press + 0.05 * Math.abs(slam),
      lamp: t >= this.boardEnd && t < this.slamAt ? (Math.sin(t / 90) > 0 ? 1 : 0.25) : 0,
      run: x - this.startX,
      livery: this.livery,
    };
  }

  /** How far open the doors are at `t`: shut, sliding open, open, jamming on each try, then slammed. */
  private openAt(t: number): number {
    if (t < ARRIVE_MS) return 0;
    if (t < ARRIVE_MS + OPEN_MS) return smooth((t - ARRIVE_MS) / OPEN_MS);
    if (t < this.boardEnd) return 1;
    if (t < this.heaveAt) {
      const k = Math.floor((t - this.boardEnd) / JAM_MS);
      const tau = t - this.boardEnd - k * JAM_MS;
      const from = k === 0 ? 1 : BOUNCED;
      const stuck = STUCK_AT[Math.min(k, STUCK_AT.length - 1)]!;
      if (tau < CLOSE_MS) {
        const u = tau / CLOSE_MS;
        return from + (stuck - from) * u * u;
      }
      if (tau < CLOSE_MS + STUCK_MS) return stuck + 0.015 * Math.sin(tau * 0.2);
      if (tau < CLOSE_MS + STUCK_MS + BOUNCE_MS) {
        return stuck + (BOUNCED - stuck) * backOut((tau - CLOSE_MS - STUCK_MS) / BOUNCE_MS);
      }
      return BOUNCED;
    }
    if (t < this.heaveAt + HEAVE_MS) return BOUNCED - 0.04 * smooth((t - this.heaveAt) / HEAVE_MS);
    if (t < this.slamAt) {
      const u = (t - this.heaveAt - HEAVE_MS) / SLAM_MS;
      return (BOUNCED - 0.04) * (1 - u * u);
    }
    return 0;
  }

  /** How hard the doors are straining against the jam at `t`, 0 to 1. */
  private strainAt(t: number): number {
    if (t < this.boardEnd || t >= this.slamAt) return 0;
    if (t >= this.heaveAt) return 1;
    const tau = (t - this.boardEnd) % JAM_MS;
    if (tau < CLOSE_MS) return tau / CLOSE_MS;
    if (tau < CLOSE_MS + STUCK_MS) return 1;
    return Math.max(0, 1 - (tau - CLOSE_MS - STUCK_MS) / 120);
  }

  /** The pusher's shove at `t`: 0 with his arms in, 1 at full stretch, quicker when the doors are jamming. */
  private shoveAt(t: number): number {
    if (t < BOARD_FROM || t >= this.slamAt) return 0;
    const period = t < this.boardEnd ? this.shoveMs : 220;
    const phase = ((t - BOARD_FROM) / period) % 1;
    // A quick shove and a slower draw back.
    return phase < 0.35 ? easeOut(phase / 0.35) : 1 - smooth((phase - 0.35) / 0.65);
  }

  /** How the pusher stands at `t`. */
  private poseAt(t: number, shoved: number): PusherPose {
    if (t < ARRIVE_MS * 0.45) return standing();
    if (t < ARRIVE_MS) return pointing(smooth((t - ARRIVE_MS * 0.45) / 300));
    if (t < BOARD_FROM) return pointing(1 - smooth((t - ARRIVE_MS) / (BOARD_FROM - ARRIVE_MS)));
    // On the first try he shoves with his hands; after that he turns and puts his back into it.
    const back = this.boardEnd + Math.min(1, this.tries - 1) * JAM_MS;
    if (t < back || (this.tries === 1 && t < this.heaveAt)) return shoving(shoved, 12);
    if (t < this.slamAt) {
      const heave = t >= this.heaveAt ? smooth((t - this.heaveAt) / HEAVE_MS) : 0;
      const strain = Math.max(heave, 0.4 + 0.4 * this.strainAt(t));
      return bracing(strain, Math.sin(t * 0.09));
    }
    if (t < this.slamAt + 200) return bracing(1 - (t - this.slamAt) / 200, 0);
    if (t < this.departAt + 250) return wiping((t - this.slamAt - 200) / (HOLD_MS + 50));
    const bow = smooth((t - this.departAt - 250) / 300) * (1 - smooth((t - this.goneAt) / 300));
    return bowing(bow);
  }

  /** Steam as the train stops and the doors open, brake sparks as it pulls up, sweat off the pusher. */
  private effects(t: number, dt: number, car: CarLook): void {
    const { scale: s, rng } = this;
    const wheels = [-122, -94, 94, 122];
    if (t > ARRIVE_MS * 0.5 && t < ARRIVE_MS) {
      this.sparks.stream(90, dt, () => {
        const wx = car.x + wheels[Math.floor(rng() * 4)]! * s;
        return {
          x: wx,
          y: this.railY,
          vx: -(120 + 200 * rng()),
          vy: -(60 + 140 * rng()),
          life: 250 + 200 * rng(),
          size: 5 + 4 * rng(),
          rotation: Math.PI + 0.4,
        };
      });
    }
    // The hiss: steam from under the car as it stops, and from the doors as they open and slam.
    if (t > ARRIVE_MS - 100 && t < ARRIVE_MS + 450) {
      this.steam.stream(70, dt, () => ({
        x: car.x + (rng() - 0.5) * 280 * s,
        y: this.carY + 44 * s,
        vx: (rng() - 0.5) * 70,
        vy: -(10 + 30 * rng()),
        life: 600 + 400 * rng(),
        size: (10 + 10 * rng()) * s,
      }));
    }
    if (t > ARRIVE_MS && t < ARRIVE_MS + OPEN_MS) {
      this.steam.stream(40, dt, () => ({
        x: this.doorX + (rng() < 0.5 ? -1 : 1) * DOOR_HALF * s,
        y: this.floorY - 2 * s,
        vx: (rng() - 0.5) * 60,
        vy: -(10 + 20 * rng()),
        life: 500 + 300 * rng(),
        size: (8 + 6 * rng()) * s,
      }));
    }
    if (this.slammed && t < this.slamAt + 150) {
      this.steam.stream(160, dt, () => ({
        x: this.doorX + (rng() - 0.5) * 6 * s,
        y: this.floorY - rng() * (FLOOR - DOOR_TOP) * s,
        vx: (rng() < 0.5 ? -1 : 1) * (40 + 80 * rng()),
        vy: (rng() - 0.5) * 30,
        life: 500 + 300 * rng(),
        size: (7 + 6 * rng()) * s,
      }));
    }
    // Sweat flying off him while he strains, and a flick of it as he wipes his brow.
    const pose = this.poseAt(t, 0);
    const head = bodyToWorld({ x: 4, y: -32 }, this.pusherX, this.floorY, s, pose);
    if (t >= this.boardEnd && t < this.slamAt) {
      this.sweat.stream(9, dt, () => ({
        x: head.x,
        y: head.y,
        vx: (rng() - 0.5) * 120,
        vy: -(90 + 80 * rng()),
        life: 500 + 200 * rng(),
        size: 3.5 * s,
      }));
    }
    if (!this.wiped && t >= this.slamAt + 200 + (HOLD_MS + 50) * 0.7) {
      this.wiped = true;
      const brow = bodyToWorld(BROW, this.pusherX, this.floorY, s, pose);
      this.sweat.burst(6, () => ({
        x: brow.x - 4 * s,
        y: brow.y,
        vx: -(60 + 120 * rng()),
        vy: -(80 + 100 * rng()),
        life: 500 + 200 * rng(),
        size: 3.5 * s,
      }));
    }
  }

  /** Streaks of wind behind the train as it pulls away. */
  private drawWind(gfx: Gfx, t: number, car: CarLook): void {
    if (t < this.departAt) return;
    const { scale: s } = this;
    const speed = Math.min(1, (this.pullAway * (t - this.departAt)) / 0.9);
    if (speed < 0.15) return;
    const tail = car.x - CAR_HALF * s;
    for (let k = 0; k < 9; k++) {
      const y = this.carY + (-46 + ((k * 37) % 88)) * s;
      const length = (60 + ((k * 53) % 90)) * s * speed;
      const x = tail - 6 - ((k * 29) % 40) * s;
      gfx.line(x - length, y, x, y, 1.6, '#ffffff', { alpha: 0.5 * speed });
    }
  }

  /** The passengers seen pressed against the glass: more of them the fuller the car, squashed harder too. */
  private drawPassengers(gfx: Gfx, t: number, car: CarLook, shoved: number): void {
    const { board, slots, scale: s } = this;
    const n = board.icons.length;
    const shown =
      n <= slots.length ? this.inside : Math.ceil((slots.length * this.inside) / Math.max(1, n));
    const full = this.inside / Math.max(1, n);
    const press = Math.min(1, full * 1.4);
    const oy = car.y + car.sag * s;
    for (let k = 0; k < Math.min(shown, slots.length); k++) {
      const slot = slots[k]!;
      const jiggle = Math.sin(t * 0.02 + slot.seed) * 0.6 * press + shoved * press * 1.2;
      const x = car.x + (slot.x + jiggle) * s;
      const y = oy + bulged(slot.x, slot.y, car.bulge) * s;
      const squash = press * (0.8 + 0.2 * Math.sin(slot.seed));
      gfx.icon(x, y, 1.05, {
        scaleX: 1 + 0.24 * squash,
        scaleY: 1 - 0.14 * squash,
        rotation: (slot.seed % 1) * 0.3 - 0.15,
      });
    }
  }

  /** The bit of platform the pusher stands on, at the car's floor, with its yellow edge and a pillar under it. */
  private drawPlatform(gfx: Gfx, alpha: number): void {
    if (alpha <= 0) return;
    const { scale: s, floorY } = this;
    const left = this.pusherX - 34 * s;
    const right = this.doorX - (DOOR_HALF + 3) * s;
    const w = right - left;
    // The pillar, fading down into the pile.
    const px = left + w * 0.35;
    const pw = 12 * s;
    gfx.quad(
      [px, floorY + 8 * s, px + pw, floorY + 8 * s, px + pw, floorY + 70 * s, px, floorY + 70 * s],
      ['#6b7078', '#4b5058', 'rgba(75, 80, 88, 0)', 'rgba(107, 112, 120, 0)'],
      { alpha },
    );
    gfx.rect(left, floorY, w, 9 * s, '#8b9099', { alpha, radius: 1.5 * s });
    gfx.rect(left, floorY, w, 2.2 * s, '#c9cdd3', { alpha });
    gfx.rect(right - 8 * s, floorY, 8 * s, 1.6 * s, '#ffd21f', { alpha });
    gfx.rect(left, floorY + 7.5 * s, w, 1.5 * s, '#5d626a', { alpha });
  }

  /** The crowd at the door, squashed with each shove, and those being shoved in. */
  private drawCrowd(gfx: Gfx, shoved: number): void {
    const { crowd, entering, scale: s } = this;
    const c = crowd.data;
    for (let k = 0; k < crowd.count; k++) {
      const at = k * 4;
      const seed = c[at + 2]!;
      const settle = c[at + 3]!;
      // Landing in the crowd with a squash, then squashed again by each shove.
      const land = (1 - settle) * 0.25;
      gfx.icon(c[at]! + 3 * s * shoved, c[at + 1]! + land * 4, 1, {
        scaleX: 1 - 0.14 * shoved + land,
        scaleY: 1 + 0.08 * shoved - land,
        rotation: Math.sin(seed) * 0.2,
      });
    }
    const e = entering.data;
    for (let k = 0; k < entering.count; k++) {
      const at = k * 4;
      gfx.icon(e[at]!, e[at + 1]!, e[at + 2], { alpha: e[at + 3]!, scaleX: 0.8 });
    }
    const h = this.hopping.data;
    for (let k = 0; k < this.hopping.count; k++) {
      const at = k * 4;
      gfx.icon(h[at]!, h[at + 1]!, 1, { rotation: h[at + 2]! });
    }
  }

  /** The icons wedged in the closing doors, squashed flat between the leaves. */
  private drawJam(gfx: Gfx, t: number, car: CarLook): void {
    if (t < this.boardEnd || t >= this.slamAt) return;
    const { board, scale: s } = this;
    const r = board.iconRadius;
    const gap = 2 * DOOR_HALF * s * car.open;
    const squeeze = Math.min(1, Math.max(0.3, (gap / (2 * r)) * 1.1));
    const oy = car.y + car.sag * s;
    const count = Math.min(3, board.icons.length);
    for (let k = 0; k < count; k++) {
      const ly = [-26, -8, 9][k]!;
      const wobble = Math.sin(t * 0.05 + k * 2) * (1 - squeeze) * 1.5;
      gfx.icon(car.x + wobble, oy + bulged(0, ly, car.bulge) * s, 1, {
        scaleX: squeeze,
        scaleY: 1 + (1 - squeeze) * 0.45,
      });
    }
  }

  /** The duds flying out of the door. */
  private drawFlying(gfx: Gfx): void {
    const f = this.flying.data;
    for (let k = 0; k < this.flying.count; k++) {
      const at = k * 4;
      gfx.icon(f[at]!, f[at + 1]!, 1, { rotation: f[at + 2]! });
    }
  }

  /** The comic burst over the door as it slams. */
  private drawBang(gfx: Gfx, t: number): void {
    const since = t - this.slamAt;
    if (since < 0 || since > 800) return;
    const { scale: s } = this;
    const grow = backOut(since / 160);
    const alpha = 1 - smooth((since - 550) / 250);
    gfx.sprite(BANG, {
      x: this.doorX + 34 * s,
      y: this.carY + (DOOR_TOP - 12) * s,
      width: BANG.width * 0.75 * s,
      height: BANG.height * 0.75 * s,
      scaleX: grow,
      scaleY: grow,
      rotation: -0.12,
      alpha,
    });
  }
}
