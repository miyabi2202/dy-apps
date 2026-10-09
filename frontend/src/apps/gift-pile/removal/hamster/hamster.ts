import {
  type Board,
  type Gfx,
  pick,
  type Point,
  type Removal,
  type Remover,
  type ScoopShape,
  type SpriteSource,
} from '../board';
import {
  type Coat,
  crownOf,
  drawHamster,
  EMPTY_POUCH,
  type Look,
  mouthOf,
  PFFT,
  SCALE,
} from './critter';
import { hamsterPortrait } from './portrait';
import { HAMSTER_SHADERS } from './shader';
import { easeOut, smooth } from '../kit/easing';
import { clumpOf, clumpSomewhere } from '../kit/clump';
import { Frames } from '../kit/clock';
import { Emitter } from '../kit/particles';

// Timing in ms, geometry in world pixels.
/** It scurries in at this speed, but takes at least this long, and stops this far short of the clump's middle. */
const SCURRY_SPEED = 420;
const SCURRY_MIN_MS = 650;
const STAND_OFF = 46;
/** It stares at the clump, wide-eyed, for this long before it tucks in. */
const PEEK_MS = 450;
/** It stuffs its cheeks over this long, at most, longer the more there are... */
const STUFF_BASE_MS = 700;
const STUFF_PER_ROOT_MS = 160;
const STUFF_MAX_MS = 4800;
/** ...in mouthfuls, each taking in its icons over this share of its turn. */
const MOUTHFUL_SHARE = 0.55;
/** An icon flies to its mouth in this long, plus this long a pixel away, up to this much more. */
const FLY_MIN_MS = 260;
const FLY_PER_PX = 0.8;
const FLY_MORE_MS = 380;
/** How small an icon is as it goes in. */
const IN_SCALE = 0.36;
/** Full up, it strains over this long at the ones that won't fit, then spits them out over this long. */
const STRAIN_MS = 750;
const SPIT_MS = 360;
/** The "噗！" stays up this long. */
const PFFT_MS = 950;
/** Afterwards it squints with relief for this long (or, with none to spit, sits contented). */
const RELIEF_MS = 600;
/** It turns round in this long, and waddles home at this speed, faster if it is far, so it takes no longer than this. */
const TURN_MS = 260;
const WADDLE_SPEED = 120;
const WADDLE_MAX_MS = 2600;
/** Its pouch's radius full up, from its smallest (one icon) to its largest (a few hundred). */
const POUCH_MIN = 18;
const POUCH_MORE = 26;
const POUCH_FULL_AT = 300;
/** The view keeps its feet and the top of its head at least this far inside it. */
const VIEW_MARGIN = 40;
/** Where it can aim, as fractions of the canvas's width. */
const AIM_FROM = 0.22;
const AIM_TO = 0.78;

/** The hamsters to pick from: golden, the first; silver-grey; and cream. */
export const COATS: readonly Coat[] = [
  { fur: '#f7b26a', line: '#b76e3b', pink: '#ffb3bd' },
  { fur: '#bab3c6', line: '#8a6f6f', pink: '#ffbfcb' },
  { fur: '#f2cf9e', line: '#b38058', pink: '#ffb5bf' },
];

/** The colours of the crumbs that fly off its paws as it stuffs. */
const CRUMBS: readonly string[] = ['#ffd23f', '#ff7aa8', '#8fd3ff', '#ffffff', '#ffa94d'];

interface Options {
  /** The coats to pick from for each visit; the first until the first pick. */
  coats?: readonly Coat[];
}

/**
 * A hamster: scurries in onto the pile to a clump and stuffs it into its cheeks, mouthful by
 * mouthful, until they swell into a ball far bigger than it is. The duds won't fit: it strains,
 * and spits them back out onto the pile, "噗！". Then it turns and waddles home with its haul.
 */
export class Hamster implements Remover {
  readonly name = 'hamster';
  /** Compiled when the page opens. */
  readonly shaders = HAMSTER_SHADERS;
  /** Its "噗！" and its cut-in portraits, painted ahead of time. */
  readonly sprites: readonly SpriteSource[];
  private readonly coats: readonly Coat[];

  constructor({ coats = COATS }: Options = {}) {
    this.coats = coats;
    this.sprites = [PFFT, ...coats.map(hamsterPortrait)];
  }

  /** A clump of the pile somewhere across it. */
  shape(rng: () => number): ScoopShape {
    return clumpSomewhere(rng, AIM_FROM, AIM_TO);
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Snack(board, now, rng, pick(this.coats, rng));
  }
}

/** One frame's icons on their way in, gathered so each layer of them is drawn in one go; `behind` says which come from behind it. */
interface Flying {
  x: Float32Array;
  y: Float32Array;
  scale: Float32Array;
  behind: Uint8Array;
}

/** One visit. */
class Snack implements Removal {
  private readonly t0: number;
  /** Which way it faces coming in (1 is right), where it sets off from, and where it stands to eat. */
  private readonly dir: number;
  private readonly startX: number;
  private readonly standX: number;
  /** When each phase ends, in ms after `t0`. */
  private readonly arrived: number;
  private readonly peeked: number;
  private readonly full: number;
  private readonly spitAt: number;
  private readonly relieved: number;
  private readonly turned: number;
  private readonly done: number;
  /** How far it waddles home. */
  private readonly homeX: number;
  /** Its pouch's radius full up. */
  private readonly pouchFull: number;
  /** When each icon sets off for its mouth and gets there, where it set off from, and a seed for its wobble. */
  private readonly startAt: Float32Array;
  private readonly arriveAt: Float32Array;
  private readonly fromX: Float32Array;
  private readonly fromY: Float32Array;
  private readonly seed: Float32Array;
  /** When each gets there, in order, to count how many are in at any time. */
  private readonly arrivals: Float32Array;
  /** The duds, the last in, in the order they are spat out, and when each is. */
  private readonly duds: Int32Array;
  /** Which icons are duds. */
  private readonly dud: Uint8Array;
  private readonly spitTimes: Float32Array;
  /** Which icons are in its cheeks (or spat out), and how many duds are out. */
  private readonly finished: Uint8Array;
  private spat = 0;
  private readonly flying: Flying;
  private introduced = false;
  private spitting = false;
  /** Where the ground is under it, followed smoothly as it moves. */
  private ground: number;
  private readonly crumbs: Emitter;
  private readonly dust: Emitter;
  private readonly spit: Emitter;
  private readonly rng: () => number;
  private readonly frames = new Frames();

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    private readonly coat: Coat,
  ) {
    const { icons, world, iconRadius } = board;
    const n = icons.length;
    const d = Math.min(board.dropCount, n);
    this.rng = rng;
    this.t0 = now;
    this.crumbs = new Emitter(
      { capacity: 160, shape: 'disc', blend: 'normal', colorFrom: '#ffffff', gravity: 520 },
      rng,
    );
    this.dust = new Emitter(
      {
        capacity: 90,
        shape: 'disc',
        blend: 'normal',
        colorFrom: '#efe4d2cc',
        sizeOverLife: (u) => 0.6 + 0.9 * u,
      },
      rng,
    );
    this.spit = new Emitter(
      { capacity: 90, shape: 'disc', blend: 'normal', colorFrom: '#d6f0ff', gravity: 700 },
      rng,
    );

    const clump = clumpOf(icons, world, 60);
    // In from the nearer side, and home the same way.
    this.dir = clump.x < world.width / 2 ? 1 : -1;
    this.startX = this.dir > 0 ? -70 : world.width + 70;
    this.standX = Math.min(world.width - 50, Math.max(50, clump.x - this.dir * STAND_OFF));
    this.ground = this.groundAt(clump.x) ?? clump.top - iconRadius * 0.45;
    this.pouchFull =
      POUCH_MIN + POUCH_MORE * Math.min(1, Math.log(1 + n) / Math.log(1 + POUCH_FULL_AT));

    this.arrived = Math.max(
      SCURRY_MIN_MS,
      (Math.abs(this.standX - this.startX) / SCURRY_SPEED) * 1000,
    );
    this.peeked = this.arrived + PEEK_MS;

    // Nearest its mouth first, in mouthfuls; the farthest are the duds, which won't fit.
    const mouth = { x: this.standX + this.dir * 4 * SCALE, y: this.ground - 16 * SCALE };
    const order = icons
      .map((p, i) => ({ i, dist: Math.hypot(p.x - mouth.x, p.y - mouth.y) }))
      .sort((a, b) => a.dist - b.dist);
    const stuffMs = Math.min(STUFF_MAX_MS, STUFF_BASE_MS + STUFF_PER_ROOT_MS * Math.sqrt(n));
    const window = Math.max(1, stuffMs - FLY_MIN_MS - FLY_MORE_MS * 0.5);
    const mouthfuls = Math.max(1, Math.min(n, 26, Math.round(1.5 + Math.sqrt(n) * 0.8)));
    const turn = window / mouthfuls;
    this.startAt = new Float32Array(n);
    this.arriveAt = new Float32Array(n);
    this.fromX = new Float32Array(n);
    this.fromY = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.finished = new Uint8Array(n);
    let full = this.peeked;
    order.forEach(({ i, dist }, rank) => {
      const m = Math.floor((rank * mouthfuls) / n);
      const first = Math.ceil((m * n) / mouthfuls);
      const size = Math.max(1, Math.ceil(((m + 1) * n) / mouthfuls) - first);
      const start =
        this.peeked + turn * m + turn * MOUTHFUL_SHARE * ((rank - first) / size) + 30 * rng();
      this.startAt[i] = start;
      this.arriveAt[i] = start + FLY_MIN_MS + Math.min(FLY_MORE_MS, dist * FLY_PER_PX);
      this.fromX[i] = icons[i]!.x;
      this.fromY[i] = icons[i]!.y;
      this.seed[i] = rng() * 10;
      full = Math.max(full, this.arriveAt[i]);
    });
    this.arrivals = Float32Array.from(this.arriveAt).sort();
    this.full = full;
    this.duds = Int32Array.from(order.slice(n - d).map(({ i }) => i));
    this.dud = new Uint8Array(n);
    for (const i of this.duds) this.dud[i] = 1;
    // A burst, most of them out at once.
    this.spitAt = d > 0 ? full + STRAIN_MS : full;
    this.spitTimes = Float32Array.from(
      { length: d },
      (_, k) => this.spitAt + SPIT_MS * (k / d) ** 1.6,
    );
    this.relieved = this.spitAt + (d > 0 ? SPIT_MS : 0) + RELIEF_MS;
    this.turned = this.relieved + TURN_MS;
    // Home the way it came, out of sight with its cheeks.
    this.homeX =
      this.dir > 0
        ? -60 - this.pouchFull * 2 * SCALE
        : world.width + 60 + this.pouchFull * 2 * SCALE;
    const far = Math.abs(this.homeX - this.standX);
    this.done = this.turned + Math.min(WADDLE_MAX_MS, (far / WADDLE_SPEED) * 1000);

    this.flying = {
      x: new Float32Array(n),
      y: new Float32Array(n),
      scale: new Float32Array(n),
      behind: new Uint8Array(n),
    };
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  draw(gfx: Gfx, now: number): void {
    const t = now - this.t0;
    const dt = this.frames.dt(now);
    const look = this.lookAt(t, dt);
    const mouth = mouthOf(look);
    // The view follows it down as it eats its way into a pile grown above the canvas.
    this.board.camera.keepInView(look.y, VIEW_MARGIN);
    this.board.camera.keepInView(crownOf(look).y, VIEW_MARGIN);

    // Full to bursting: the cut-in, as it strains at the ones that won't fit (or, with none, as it
    // sits back contented).
    if (!this.introduced && t >= this.full) {
      this.introduced = true;
      this.board.fx.cutIn({
        name: 'hamster',
        color: this.coat.fur,
        portrait: hamsterPortrait(this.coat),
      });
    }

    const nf = this.stuff(t, mouth);
    this.spitOut(t, mouth);

    // The icons on their way in, each layer in one go: those coming from behind it under it, so
    // they don't hide its face, and those coming from in front over it, into its mouth.
    const { flying: f, board } = this;
    for (let k = 0; k < nf; k++) if (f.behind[k]) board.stamp(f.x[k]!, f.y[k]!, f.scale[k]);
    this.dust.step(dt);
    this.dust.draw(gfx);
    drawHamster(gfx, look, this.coat);
    // The ones that won't fit, poking out of its mouth as it strains.
    if (this.duds.length > 0 && t >= this.full && t < this.spitAt) {
      const r = board.iconRadius;
      const shown = Math.min(3, this.duds.length);
      for (let k = 0; k < shown; k++) {
        const jiggle = Math.sin(t * 0.06 + k * 2.1) * 1.2;
        board.stamp(
          mouth.x + look.dir * (r * 0.25 + k * 3) + jiggle,
          mouth.y + r * 0.2 + (k - (shown - 1) / 2) * 4,
          0.42,
        );
      }
    }
    for (let k = 0; k < nf; k++) if (!f.behind[k]) board.stamp(f.x[k]!, f.y[k]!, f.scale[k]);
    this.crumbs.step(dt);
    this.crumbs.draw(gfx);
    this.spit.step(dt);
    this.spit.draw(gfx);
    this.drawPfft(gfx, t, mouth, look.dir);
    // A sparkle of contentment as it squints.
    if (t >= this.spitAt + SPIT_MS && t < this.relieved) {
      const u = (t - this.spitAt - SPIT_MS) / RELIEF_MS;
      const crown = crownOf(look);
      const twinkle = Math.sin(Math.PI * u);
      gfx.particles({
        count: 2,
        xy: new Float32Array([
          crown.x + look.dir * 14,
          crown.y - 4 - 8 * u,
          crown.x - look.dir * 10,
          crown.y + 2 - 6 * u,
        ]),
        size: new Float32Array([14 * twinkle, 9 * twinkle]),
        rgba: new Float32Array([1, 0.93, 0.6, twinkle, 1, 1, 1, twinkle]),
        shape: 'star',
        blend: 'normal',
      });
    }
  }

  /** Pulls each icon whose turn has come to its mouth, shrinking, and swallows it into its cheeks; gathers the ones on their way. */
  private stuff(t: number, mouth: Point): number {
    const { board, flying: f, rng } = this;
    const n = board.icons.length;
    let nf = 0;
    for (let i = 0; i < n; i++) {
      if (this.finished[i] || t < this.startAt[i]!) continue;
      const at = board.take(i);
      if (at) {
        this.fromX[i] = at.x;
        this.fromY[i] = at.y;
      }
      if (t >= this.arriveAt[i]!) {
        // In it goes. A dud stays in its cheek until it is spat out.
        this.finished[i] = 1;
        if (!this.dud[i]) board.destroy(i);
        if (rng() < 0.4) {
          this.crumbs.burst(1, () => ({
            x: mouth.x,
            y: mouth.y,
            vx: (rng() - 0.5) * 120,
            vy: -(60 + 120 * rng()),
            life: 500 + 300 * rng(),
            size: 3 + 2 * rng(),
            color: pick(CRUMBS, rng),
          }));
        }
        continue;
      }
      // Slurped in: slow to start, then fast, over a little hop, swinging as it shrinks.
      const u = (t - this.startAt[i]!) / (this.arriveAt[i]! - this.startAt[i]!);
      const e = u * u * (0.4 + 0.6 * u);
      const fx = this.fromX[i]!;
      const fy = this.fromY[i]!;
      const hop = Math.min(36, 10 + Math.hypot(mouth.x - fx, mouth.y - fy) * 0.25);
      f.x[nf] = fx + (mouth.x - fx) * e + Math.sin(u * 9 + this.seed[i]!) * 3 * (1 - u);
      f.y[nf] = fy + (mouth.y - fy) * e - Math.sin(Math.PI * u) * hop;
      f.scale[nf] = 1 - (1 - IN_SCALE) * u ** 1.4;
      f.behind[nf++] = (fx - mouth.x) * this.dir < -board.iconRadius ? 1 : 0;
    }
    return nf;
  }

  /** Spits the duds back out of its mouth onto the pile, all in a burst. */
  private spitOut(t: number, mouth: Point): void {
    const { board, rng, dir } = this;
    if (!this.spitting && this.duds.length > 0 && t >= this.spitAt) {
      this.spitting = true;
      board.fx.shake(5, 300);
      // A spray of spittle.
      this.spit.burst(18, () => {
        const a = -0.9 + (rng() - 0.5) * 1.4;
        const v = 120 + 260 * rng();
        return {
          x: mouth.x,
          y: mouth.y,
          vx: Math.cos(a) * v * dir,
          vy: Math.sin(a) * v,
          life: 400 + 300 * rng(),
          size: 2.5 + 3 * rng(),
        };
      });
    }
    while (this.spat < this.duds.length && t >= this.spitTimes[this.spat]!) {
      const i = this.duds[this.spat++]!;
      // Forward and up in a fan, landing back on the pile.
      const a = -1.25 + 1.1 * rng();
      const v = 200 + 320 * rng();
      board.drop(i, mouth.x + dir * 4, mouth.y, Math.cos(a) * v * dir, Math.sin(a) * v);
    }
  }

  /** "噗！" by its mouth as it spits, popping up big and drifting off. */
  private drawPfft(gfx: Gfx, t: number, mouth: Point, dir: number): void {
    if (this.duds.length === 0 || t < this.spitAt || t >= this.spitAt + PFFT_MS) return;
    const u = (t - this.spitAt) / PFFT_MS;
    // A ring of breath bursting out of its mouth, and lines shooting out from it.
    if (u < 0.3) {
      const v = u / 0.3;
      const r = 6 + 34 * easeOut(v);
      gfx.ellipseStroke(mouth.x + dir * r * 0.6, mouth.y, r * 0.6, r, 0, 2.2 * (1 - v), '#ffffff', {
        alpha: 0.85 * (1 - v),
      });
      for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
        const c = Math.cos(a) * dir;
        const s = Math.sin(a);
        const from = 12 + 40 * easeOut(v);
        gfx.line(
          mouth.x + c * from,
          mouth.y + s * from,
          mouth.x + c * (from + 12 * (1 - v)),
          mouth.y + s * (from + 12 * (1 - v)),
          2,
          '#ffffff',
          { alpha: 1 - v },
        );
      }
    }
    // Overshooting as it pops up, and shrinking away at the end.
    const pop =
      (u < 0.18 ? easeOut(u / 0.18) * 1.25 : 1.25 - 0.25 * smooth((u - 0.18) / 0.2)) *
      (1 - 0.6 * smooth((u - 0.8) / 0.2));
    gfx.sprite(PFFT, {
      x: mouth.x + dir * (34 + 10 * u),
      y: mouth.y - 30 - 18 * u,
      scaleX: pop,
      scaleY: pop,
      rotation: -0.12 * dir,
      alpha: 1 - smooth((u - 0.85) / 0.15),
    });
  }

  /** The pile's top under x, for its feet (the floor where there is none), or null off the canvas. */
  private groundAt(x: number): number | null {
    const { board } = this;
    if (x < 0 || x > board.world.width) return null;
    const top = board.topAt(x);
    return top === null ? board.world.height - 2 : top - board.iconRadius * 0.45;
  }

  /** How it is to be drawn at `t`: where it is, how it leans, how full its cheeks are, and its face. */
  private lookAt(t: number, dt: number): Look {
    const n = this.board.icons.length;
    const d = this.duds.length;
    const look: Look = {
      x: this.standX,
      y: 0,
      dir: this.dir,
      tilt: 0,
      squash: 1,
      pouch: EMPTY_POUCH,
      stuffed: 0,
      eyes: 'dot',
      mouth: 'smile',
      chew: 0,
      paws: null,
      step: 0,
      stride: 0,
      sweat: 0,
      slide: 0,
      quiver: 0,
      t,
    };
    let hop = 0;

    // The cheeks: swelling with each mouthful, popping a little bigger as it goes in.
    const inNow = countUpTo(this.arrivals, t);
    const shown = n > 0 ? (inNow - countUpTo(this.spitTimes, t)) / n : 0;
    let pouch = EMPTY_POUCH + (this.pouchFull - EMPTY_POUCH) * shown ** 0.75;
    if (inNow > 0 && t < this.full + 200) {
      const since = t - this.arrivals[inNow - 1]!;
      pouch *= 1 + 0.07 * Math.exp(-since / 140) * Math.cos(since * 0.035);
    }
    look.stuffed = shown;

    if (t < this.arrived) {
      // Scurrying in on little legs, hopping, braking at the end.
      const u = t / this.arrived;
      look.x = this.startX + (this.standX - this.startX) * (1 - (1 - u) ** 2);
      look.step = t * 0.045;
      look.stride = 1 - smooth((u - 0.8) / 0.2);
      hop = Math.abs(Math.sin(t * 0.0225)) * 4 * look.stride;
      look.tilt = 0.1 * look.stride - 0.12 * Math.sin(Math.PI * smooth((u - 0.8) / 0.2));
      if (look.stride > 0.3) {
        this.dust.stream(18 * look.stride, dt, () => ({
          x: look.x - look.dir * 14,
          y: this.ground,
          vx: -look.dir * (20 + 40 * this.rng()),
          vy: -(10 + 20 * this.rng()),
          life: 400 + 200 * this.rng(),
          size: 5 + 4 * this.rng(),
        }));
      }
    } else if (t < this.peeked) {
      // A wide-eyed stare at all that, and a hop of delight.
      const u = (t - this.arrived) / PEEK_MS;
      look.eyes = 'wide';
      hop = Math.sin(Math.PI * smooth((u - 0.35) / 0.5)) * 9;
      look.squash = u < 0.35 ? 1 - 0.08 * Math.sin((Math.PI * u) / 0.35) : 1;
    } else if (t < this.full) {
      // Stuffing, paws going, cheeks chewing, leaning in to the food.
      look.paws = (t * 0.004) % 1;
      look.mouth = 'chew';
      look.chew = 0.5 + 0.5 * Math.sin(t * 0.03);
      look.tilt = 0.08;
      look.eyes = shown > 0.7 ? 'happy' : 'dot';
      pouch *= 1 + 0.025 * Math.sin(t * 0.03);
      look.squash = 1 + 0.025 * Math.sin(t * 0.03 + 1);
    } else if (d > 0 && t < this.spitAt) {
      // Full to bursting, and still more to go in: it strains, quivering and sweating.
      const u = (t - this.full) / STRAIN_MS;
      look.eyes = 'shut';
      look.mouth = 'tight';
      look.quiver = smooth(u / 0.2);
      look.sweat = smooth(u / 0.3);
      look.x += Math.sin(t * 0.09) * 1.3;
      pouch *= 1 + 0.07 * smooth(u) + 0.015 * Math.sin(t * 0.08);
      look.squash = 1 - 0.06 * smooth(u) + 0.02 * Math.sin(t * 0.05);
    } else if (t < this.relieved) {
      // 噗! Rocked back by the spit, then a squint of relief as the sweat slides off.
      const s = t - this.spitAt;
      if (d > 0 && s < SPIT_MS + 200) {
        const kick = Math.sin(Math.PI * Math.min(1, s / (SPIT_MS + 200)));
        look.x -= look.dir * 10 * kick;
        look.tilt = -0.25 * kick;
        look.mouth = s < SPIT_MS ? 'open' : 'smile';
        look.eyes = 'wide';
        // The cheeks spring back, wobbling.
        pouch *= 1 + 0.12 * Math.exp(-s / 150) * Math.cos(s * 0.03);
        look.sweat = 1;
        look.slide = 0;
      } else {
        const u = (s - (d > 0 ? SPIT_MS + 200 : 0)) / Math.max(1, RELIEF_MS - (d > 0 ? 200 : 0));
        look.eyes = 'happy';
        if (d > 0) {
          look.sweat = 1 - smooth((u - 0.6) / 0.4);
          look.slide = easeOut(u);
        }
        look.squash = 1 + 0.03 * Math.sin(Math.PI * Math.min(1, u));
      }
    } else if (t < this.turned) {
      // A hop round to face home.
      const u = (t - this.relieved) / TURN_MS;
      look.dir = u < 0.5 ? this.dir : -this.dir;
      hop = Math.sin(Math.PI * u) * 7;
      look.eyes = 'happy';
    } else {
      // Waddling home, rocking from side to side under its cheeks, bouncing at each step.
      const u = (t - this.turned) / (this.done - this.turned);
      look.dir = -this.dir;
      look.x = this.standX + (this.homeX - this.standX) * u;
      look.step = (t - this.turned) * 0.022;
      look.stride = 0.8;
      look.tilt = Math.sin(look.step) * 0.16;
      hop = Math.abs(Math.cos(look.step)) * 5;
      look.squash = 1 - 0.05 * Math.abs(Math.sin(look.step));
      look.eyes = 'happy';
      pouch *= 1 + 0.02 * Math.sin(look.step * 2);
    }
    look.pouch = pouch;

    // Its feet on the pile's top, followed smoothly as the pile changes under it.
    const under = this.groundAt(look.x);
    if (under !== null) {
      const k = 1 - Math.exp(-Math.max(dt, 0) / 90);
      this.ground += (under - this.ground) * k;
    }
    look.y = this.ground - hop;
    return look;
  }
}

/** How many of `sorted` are at or before `t`. */
function countUpTo(sorted: Float32Array, t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
