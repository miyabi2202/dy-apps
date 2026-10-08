import {
  type Board,
  type Gfx,
  pick,
  type Removal,
  type Remover,
  type SpriteSource,
} from '../board';
import { easeOut } from '../kit/easing';
import { fireworksPortrait } from './portrait';
import { drawFlash, drawRocket, FIREWORKS_SHADERS } from './shader';
import { Frames } from '../kit/clock';
import { DRIP, GLITTER, SMOKE, STAR, StarPool, type StarSpawn } from './star-pool';

// Timing in ms, geometry in world pixels.
/** At most this many rockets, launched over at most this long. */
const MAX_ROCKETS = 14;
const LAUNCH_EACH_MS = 260;
const LAUNCH_MAX_MS = 2600;
/** A rocket's icons gather at its foot over this long, then it climbs for this long. */
const GATHER_MS = 840;
const CLIMB_MS = 550;
/** Each icon's own flight into the shell, as a share of the gathering: they set off one after another. */
const FLY = 0.35;
/** The shell the icons gather into is as big as them all together, up to this many icons across. */
const SHELL_MAX = 3.2;
/** The burst: how long it lasts, how far it spreads, and how many sparks it throws. */
const BURST_MS = 1150;
const BURST_R = 62;
const SPARKS = 30;
/** How far the sparks sink under gravity by the end of the burst. */
const SINK = 38;
/** Where the bursts go off, as fractions of the view's height from its top. */
const APEX_FROM = 0.1;
const APEX_TO = 0.32;
/** Duds fall back this long into the burst. */
const DUD_MS = 160;

/** The screen's reaction to a burst: its flash, its ring of air, and its split of colour last this long. */
const FLASH_MS = 180;
const RING_MS = 350;
const SPLIT_MS = 120;
/** The sparks of a burst can live this much longer than the icons' flight: the show waits for them. */
const AFTERGLOW_MS = 800;
/** The flash at the heart of a burst: how long it lasts, and how far its rays reach. */
const FLARE_MS = 520;
const FLARE_R = 105;
/** The icons are white-hot for this long as they fly apart. */
const HOT_MS = 80;

/** How a burst looks. */
type Style = 'peony' | 'chrysanthemum' | 'ring' | 'willow' | 'crossette';
const STYLES: readonly Style[] = ['peony', 'chrysanthemum', 'ring', 'willow', 'crossette'];

/** A spark followed by hand, to leave a sub-trail or to split in four. */
interface Leader {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  colour: string;
  /** Splits in four when it has lived this long; 0 if it only leaves a trail. */
  splitAt: number;
}

/** A show's colours: each rocket takes the next of them. */
export type FireworkPalette = readonly string[];

export const FIREWORK_PALETTES: readonly FireworkPalette[] = [
  // Red and gold.
  ['#F87171', '#FBBF24', '#FDE68A'],
  // Cool blues and violets.
  ['#60A5FA', '#A78BFA', '#F0ABFC'],
  // Lime and mint.
  ['#34D399', '#A3E635', '#FEF08A'],
  // Pinks.
  ['#F472B6', '#FB7185', '#FECDD3'],
  // Rainbow.
  ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7'],
];

interface Options {
  /** The colours to pick from for each show; the first until the first pick. */
  palettes?: readonly FireworkPalette[];
}

/**
 * Fireworks (烟花): the icons go up in a handful of rockets, each gathered from one part of
 * the pile, and burst in the sky, flying apart with the sparks and fading out; the duds fall
 * back onto the pile.
 */
export class Fireworks implements Remover {
  readonly name = 'fireworks';
  readonly shaders = FIREWORKS_SHADERS;
  /** Its cut-in portraits, painted ahead of time. */
  readonly sprites: readonly SpriteSource[];
  private readonly palettes: readonly FireworkPalette[];

  constructor({ palettes = FIREWORK_PALETTES }: Options = {}) {
    this.palettes = palettes;
    this.sprites = [...new Set(palettes.flat())].map(fireworksPortrait);
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Show(board, now, rng, pick(this.palettes, rng));
  }
}

/** One rocket: its icons, where it goes up from and bursts, and when. */
interface Rocket {
  icons: number[];
  colour: string;
  /** The shell's size, as a scale of one icon. */
  shell: number;
  footX: number;
  footY: number;
  apexX: number;
  apexY: number;
  /** When it starts gathering, in ms after the show's start. */
  at: number;
  /** Each spark's direction and how far it goes, as a share of `BURST_R`. */
  sparks: { dx: number; dy: number; reach: number }[];
  /** Each icon's direction out of the burst and how far it goes. */
  flight: { dx: number; dy: number; reach: number }[];
  taken: boolean;
  /** Where its icons were taken from. */
  fromX: number[];
  fromY: number[];
  /** When each icon sets off into the shell, as a share of the gathering: nearest first. */
  setOff: number[];
  style: Style;
  /** The burst has gone off. */
  burst: boolean;
}

/** One show. */
class Show implements Removal {
  private readonly t0: number;
  private readonly rockets: Rocket[];
  private readonly done: number;
  /** The icons that are duds, and which have fallen back or burnt out. */
  private introduced = false;
  private readonly duds = new Set<number>();
  private readonly finished = new Set<number>();
  private readonly rng: () => number;
  private readonly frames = new Frames();
  /** The burst's stars, drips and glitter, and the smoke of the climb and the afterglow. */
  private readonly sparks: StarPool;
  private readonly smoke: StarPool;
  private readonly leaders: Leader[] = [];
  /** The bursts that have gone off, for the screen's reaction. */
  private readonly blasts: {
    x: number;
    y: number;
    at: number;
    colour: string;
    pileY: number;
    seed: number;
  }[] = [];

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    palette: FireworkPalette,
  ) {
    const { icons, world } = board;
    const n = icons.length;
    this.t0 = now;
    this.rng = rng;
    // The stars are drawn well over 1: white-hot, for the bloom to take up.
    this.sparks = new StarPool(9000, rng, { gain: 1.25 });
    // The smoke is lit by its burst at first, and left to the dark.
    this.smoke = new StarPool(500, rng, {
      strength: (u) => 0.12 + 0.9 * Math.exp(-6 * u),
      sizeOverLife: (u) => 0.6 + 0.9 * u,
    });
    // Rockets from left to right, each taking the icons in its stretch of the pile.
    const count = Math.max(1, Math.min(n, MAX_ROCKETS, Math.round(Math.sqrt(n) * 1.5)));
    const byX = Array.from({ length: n }, (_, i) => i).sort((a, b) => icons[a]!.x - icons[b]!.x);
    const span = Math.min(LAUNCH_MAX_MS, LAUNCH_EACH_MS * (count - 1));
    // They go up in a shuffled order, so the show isn't a sweep across.
    const order = Array.from({ length: count }, (_, r) => r);
    for (let r = count - 1; r > 0; r--) {
      const j = Math.floor(rng() * (r + 1));
      [order[r], order[j]] = [order[j]!, order[r]!];
    }
    this.rockets = order.map((slot, r) => {
      const group = byX.slice(Math.floor((r * n) / count), Math.floor(((r + 1) * n) / count));
      let sumX = 0;
      let top = Infinity;
      for (const i of group) {
        sumX += icons[i]!.x;
        top = Math.min(top, icons[i]!.y);
      }
      const footX = group.length > 0 ? sumX / group.length : world.width / 2;
      // Its icons' area together, so the shell reads as all of them in one.
      const shell = Math.max(1, Math.min(SHELL_MAX, Math.sqrt(group.length)));
      const ray = () => {
        const a = rng() * Math.PI * 2;
        return { dx: Math.cos(a), dy: Math.sin(a), reach: 0.55 + 0.45 * rng() };
      };
      return {
        icons: group,
        colour: palette[r % palette.length]!,
        shell,
        footX,
        // The shell sits on the pile, rather than sunk into it.
        footY: (Number.isFinite(top) ? top : world.height) - (shell - 1) * board.iconRadius,
        apexX: footX + (rng() - 0.5) * 70,
        apexY:
          board.camera.view.top +
          board.camera.view.height * (APEX_FROM + (APEX_TO - APEX_FROM) * rng()),
        at: count > 1 ? (span * slot) / (count - 1) + rng() * 120 : 0,
        sparks: Array.from({ length: SPARKS }, ray),
        flight: group.map(ray),
        taken: false,
        fromX: [],
        fromY: [],
        setOff: [],
        style: pick(STYLES, rng),
        burst: false,
      };
    });
    this.done =
      Math.max(...this.rockets.map((r) => r.at)) + GATHER_MS + CLIMB_MS + BURST_MS + AFTERGLOW_MS;
    // The duds, spread over the rockets.
    for (let k = 0; k < board.dropCount; k++)
      this.duds.add(byX[Math.floor((k * n) / board.dropCount)]!);
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  draw(gfx: Gfx, now: number): void {
    const t = now - this.t0;
    const dt = this.frames.dt(t);
    for (const rocket of this.rockets) {
      const u = t - rocket.at;
      if (u < 0) continue;
      if (!rocket.taken) this.launch(rocket);
      if (u < GATHER_MS) this.drawGather(rocket, u / GATHER_MS);
      else if (u < GATHER_MS + CLIMB_MS) {
        this.drawClimb(gfx, rocket, (u - GATHER_MS) / CLIMB_MS, dt);
      } else if (u < GATHER_MS + CLIMB_MS + BURST_MS) {
        if (!rocket.burst) this.explode(rocket, t);
        this.drawBurst(gfx, rocket, (u - GATHER_MS - CLIMB_MS) / BURST_MS);
      } else {
        if (!rocket.burst) this.explode(rocket, t);
        this.burnOut(rocket);
      }
    }
    this.stepLeaders(dt);
    this.screen(gfx, t);
    this.smoke.step(dt);
    this.sparks.step(dt);
    this.smoke.draw(gfx, 'smoke');
    this.sparks.draw(gfx, 'stars');
    this.flashes(gfx, t);
  }

  /** The flash at the heart of each burst, going off. */
  private flashes(gfx: Gfx, t: number): void {
    for (const b of this.blasts) {
      const age = t - b.at;
      if (age < FLARE_MS) drawFlash(gfx, b.x, b.y, FLARE_R, age / FLARE_MS, b.colour, b.seed);
    }
  }

  /** The screen's reaction to each burst: a flash, a ring of air, a split of colour, and the pile lit. */
  private screen(gfx: Gfx, t: number): void {
    let rings = 0;
    for (let k = this.blasts.length - 1; k >= 0; k--) {
      const b = this.blasts[k]!;
      const age = t - b.at;
      if (age > 1500) {
        this.blasts.splice(k, 1);
        continue;
      }
      if (age < FLASH_MS) gfx.flash(b.colour, 0.18 * (1 - age / FLASH_MS));
      if (age < SPLIT_MS) gfx.aberration(0.3);
      if (age < RING_MS && rings < 4) {
        rings++;
        const u = age / RING_MS;
        gfx.shockwave(b.x, b.y, 140 * easeOut(u), 30, 6 * (1 - u));
      }
      if (age < 1000) gfx.glow(b.x, b.pileY, 150, b.colour, { intensity: 0.14 * (1 - age / 1000) });
    }
  }

  /** The shell bursts: sparks in its style, and the screen's reaction. */
  private explode(rocket: Rocket, t: number): void {
    rocket.burst = true;
    const { apexX: x, apexY: y, colour } = rocket;
    const { rng } = this;
    this.blasts.push({ x, y, at: t, colour, pileY: rocket.footY, seed: rng() });
    this.board.fx.shake(1.5, 150);
    const TAU = Math.PI * 2;
    const spark = (
      mode: number,
      angle: number,
      speed: number,
      life: number,
      size = 11,
      c: string = colour,
    ) =>
      this.sparks.add({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        size,
        color: c,
        mode,
      });
    const hot = (angle: number, speed: number) => spark(STAR, angle, speed, 190, 9, '#ffffff');
    switch (rocket.style) {
      case 'peony':
        for (let k = 0; k < 300; k++) {
          const a = rng() * TAU;
          const v = 220 + 200 * rng();
          spark(STAR, a, v, 900 + 400 * rng());
          if (k % 5 === 0) hot(a, v);
        }
        break;
      case 'chrysanthemum':
        for (let k = 0; k < 200; k++) {
          const a = rng() * TAU;
          const v = 200 + 160 * rng();
          const life = 1100 + 300 * rng();
          spark(STAR, a, v, life);
          // The brightest leave sub-trails of their own.
          if (k < 40) {
            this.leaders.push({
              x,
              y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              age: 0,
              life,
              colour,
              splitAt: 0,
            });
          }
          if (k % 4 === 0) hot(a, v);
        }
        break;
      case 'ring': {
        // A ring seen at a tilt: squashed one way.
        const tilt = 0.35 + 0.6 * rng();
        const turn = rng() * Math.PI;
        for (let k = 0; k < 240; k++) {
          const a = (k / 240) * TAU;
          const px = Math.cos(a) * 300;
          const py = Math.sin(a) * 300 * tilt;
          const vx = px * Math.cos(turn) - py * Math.sin(turn);
          const vy = px * Math.sin(turn) + py * Math.cos(turn);
          this.sparks.add({ x, y, vx, vy, life: 1000 + 200 * rng(), size: 11, color: colour });
          if (k % 6 === 0) hot(Math.atan2(vy, vx), Math.hypot(vx, vy));
        }
        break;
      }
      case 'willow':
        for (let k = 0; k < 160; k++) {
          const a = rng() * TAU;
          spark(DRIP, a, 120 + 100 * rng(), 1500 + 600 * rng(), 11, '#fde68a');
          if (k % 4 === 0) hot(a, 200);
        }
        break;
      case 'crossette':
        for (let k = 0; k < 80; k++) {
          const a = (k / 80) * TAU + rng() * 0.2;
          const v = 240 + 140 * rng();
          const life = 650 + 150 * rng();
          this.leaders.push({
            x,
            y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            age: 0,
            life: life * 0.4,
            colour,
            splitAt: life * 0.4,
          });
          spark(STAR, a, v, life * 0.4);
          if (k % 4 === 0) hot(a, v);
        }
        break;
    }
    // The smoke it leaves, lit by the burst from inside and drifting out.
    for (let k = 0; k < 4; k++) {
      const a = rng() * TAU;
      const v = 18 + 50 * rng();
      this.smoke.add({
        x: x + Math.cos(a) * 14,
        y: y + Math.sin(a) * 14,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 1300 + 400 * rng(),
        size: 90 + 70 * rng(),
        color: colour,
        mode: SMOKE,
      });
    }
  }

  /** Move the sparks that are followed by hand, leaving a trail or splitting in four. */
  private stepLeaders(dt: number): void {
    const keep = Math.exp(-0.6 * (dt / 1000));
    for (let k = this.leaders.length - 1; k >= 0; k--) {
      const l = this.leaders[k]!;
      l.age += dt;
      l.vy += 160 * (dt / 1000);
      l.vx *= keep;
      l.vy *= keep;
      l.x += l.vx * (dt / 1000);
      l.y += l.vy * (dt / 1000);
      if (l.splitAt > 0 && l.age >= l.splitAt) {
        // In four, as a cross.
        const turn = this.rng() * Math.PI;
        for (let c = 0; c < 4; c++) {
          const a = turn + (c * Math.PI) / 2;
          this.sparks.add({
            x: l.x,
            y: l.y,
            vx: l.vx * 0.3 + Math.cos(a) * 140,
            vy: l.vy * 0.3 + Math.sin(a) * 140,
            life: 700,
            size: 10,
            color: l.colour,
          });
        }
        this.leaders.splice(k, 1);
      } else if (l.age >= l.life) this.leaders.splice(k, 1);
      else if (l.splitAt === 0) {
        this.sparks.add({
          x: l.x,
          y: l.y,
          vx: (this.rng() - 0.5) * 30,
          vy: (this.rng() - 0.5) * 30,
          life: 450,
          size: 10,
          color: l.colour,
          mode: GLITTER,
        });
      }
    }
  }

  /** The rocket's icons leave the pile. */
  private launch(rocket: Rocket): void {
    rocket.taken = true;
    // The first to go up brings the cut-in; the show is the point, so no freeze or shake.
    if (!this.introduced) {
      this.introduced = true;
      this.board.fx.cutIn({
        name: 'fireworks',
        color: rocket.colour,
        portrait: fireworksPortrait(rocket.colour),
        shake: 0,
      });
    }
    for (const i of rocket.icons) {
      const at = this.board.take(i) ?? this.board.icons[i]!;
      rocket.fromX.push(at.x);
      rocket.fromY.push(at.y);
    }
    const n = rocket.icons.length;
    const distance = (k: number) =>
      Math.hypot(rocket.fromX[k]! - rocket.footX, rocket.fromY[k]! - rocket.footY);
    const nearest = Array.from({ length: n }, (_, k) => k).sort(
      (a, b) => distance(a) - distance(b),
    );
    rocket.setOff = Array.from({ length: n }, () => 0);
    nearest.forEach((k, rank) => {
      rocket.setOff[k] = n > 1 ? (rank / (n - 1)) * (1 - FLY) : 0;
    });
  }

  /**
   * The icons flying one after another to the rocket's foot, nearest first, each joining a
   * shell there that grows with every one that arrives.
   */
  private drawGather(rocket: Rocket, u: number): void {
    const n = rocket.icons.length;
    let arrived = 0;
    const flying: { x: number; y: number }[] = [];
    for (let k = 0; k < n; k++) {
      const p = Math.min(1, Math.max(0, (u - rocket.setOff[k]!) / FLY));
      if (p >= 1) {
        arrived++;
        continue;
      }
      const e = easeOut(p);
      flying.push({
        x: rocket.fromX[k]! + (rocket.footX - rocket.fromX[k]!) * e,
        y: rocket.fromY[k]! + (rocket.footY - rocket.fromY[k]!) * e,
      });
    }
    // The shell's area is the share of the icons in it so far.
    if (arrived > 0)
      this.board.stamp(rocket.footX, rocket.footY, rocket.shell * Math.sqrt(arrived / n));
    for (const at of flying) this.board.stamp(at.x, at.y);
  }

  /** Where the rocket is `u` of the way up its climb. */
  private climbAt(rocket: Rocket, u: number): { x: number; y: number } {
    const e = easeOut(u);
    return {
      x: rocket.footX + (rocket.apexX - rocket.footX) * e * e,
      y: rocket.footY + (rocket.apexY - rocket.footY) * e,
    };
  }

  /** The shell climbing, with a trail of light, smoke and crackling sparks behind it. */
  private drawClimb(gfx: Gfx, rocket: Rocket, u: number, dt: number): void {
    const at = this.climbAt(rocket, u);
    const tail = this.climbAt(rocket, Math.max(0, u - 0.4));
    const { rng } = this;
    this.smoke.stream(50, dt, (): StarSpawn => ({
      x: at.x + (rng() - 0.5) * 4,
      y: at.y + 6,
      vx: (rng() - 0.5) * 16,
      vy: 10 + 12 * rng(),
      life: 900,
      size: 30,
      color: rocket.colour,
      mode: SMOKE,
    }));
    // Glitter shaken off the fuse.
    this.sparks.stream(80, dt, (): StarSpawn => ({
      x: tail.x + (at.x - tail.x) * rng() ** 2,
      y: tail.y + (at.y - tail.y) * rng() ** 2,
      vx: (rng() - 0.5) * 90,
      vy: 40 + 90 * rng(),
      life: 500,
      size: 11,
      color: rocket.colour,
      mode: GLITTER,
    }));
    gfx.glow(at.x, at.y, 20 * rocket.shell, rocket.colour, { intensity: 0.7 });
    this.board.stamp(at.x, at.y, rocket.shell);
    drawRocket(
      gfx,
      at.x,
      at.y,
      tail.x,
      tail.y,
      4 + rocket.shell,
      rocket.colour,
      (rocket.footX * 0.0137) % 1,
    );
  }

  /** The burst, `u` of the way through: a flash, the sparks, and the icons flying apart. */
  private drawBurst(gfx: Gfx, rocket: Rocket, u: number): void {
    const { apexX: x, apexY: y } = rocket;
    const spread = easeOut(u) * BURST_R;
    const sink = SINK * u * u;
    rocket.icons.forEach((i, k) => {
      if (this.finished.has(i)) return;
      const f = rocket.flight[k]!;
      const ix = x + f.dx * f.reach * spread * 0.8;
      const iy = y + f.dy * f.reach * spread * 0.8 + sink;
      if (this.duds.has(i) && u * BURST_MS >= DUD_MS) {
        this.finished.add(i);
        this.board.drop(i, ix, iy);
        return;
      }
      const hot = u * BURST_MS < HOT_MS;
      if (hot) gfx.icon(ix, iy, 0.7 * (1 - u), { material: { kind: 'solid', color: '#ffffff' } });
      else this.board.stamp(ix, iy, 0.7 * (1 - u));
      // Each leaves a few sparks as it goes.
      if (this.rng() < 0.4) {
        this.sparks.add({
          x: ix,
          y: iy,
          vx: (this.rng() - 0.5) * 60,
          vy: (this.rng() - 0.5) * 60,
          life: 400,
          size: 10,
          color: rocket.colour,
          mode: GLITTER,
        });
      }
    });
  }

  /** The burst is over: whatever of it is left is gone. */
  private burnOut(rocket: Rocket): void {
    for (const i of rocket.icons) {
      if (this.finished.has(i)) continue;
      this.finished.add(i);
      if (this.duds.has(i)) this.board.drop(i, rocket.apexX, rocket.apexY);
      else this.board.destroy(i);
    }
  }
}
