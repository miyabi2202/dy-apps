import { type Board, type Gfx, pick, type Removal, type Remover } from '../board';
import { easeOut } from '../kit/easing';
import { fireworksPortrait } from '../kit/portraits';
import { Frames } from '../kit/clock';
import { Emitter } from '../kit/particles';

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

/** The colour of a rocket's climbing trail. */
const TRAIL = '#FEF08A';
/** The screen's reaction to a burst: its flash, its ring of air, and its split of colour last this long. */
const FLASH_MS = 180;
const RING_MS = 350;
const SPLIT_MS = 120;
/** The sparks of a burst can live this much longer than the icons' flight: the show waits for them. */
const AFTERGLOW_MS = 800;
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
  private readonly palettes: readonly FireworkPalette[];

  constructor({ palettes = FIREWORK_PALETTES }: Options = {}) {
    this.palettes = palettes;
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
  /** The burst's sparks (and the willow's, which fall harder), the smoke and crackle of the climb, and the icons' sparks. */
  private readonly sparks: Emitter;
  private readonly willow: Emitter;
  private readonly smoke: Emitter;
  private readonly crackle: Emitter;
  private readonly leaders: Leader[] = [];
  /** The bursts that have gone off, for the screen's reaction. */
  private readonly blasts: { x: number; y: number; at: number; colour: string; pileY: number }[] =
    [];

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
    const burst = {
      shape: 'spark' as const,
      blend: 'add' as const,
      drag: 0.6,
      alphaOverLife: (u: number) => 1 - u,
      twinkle: 0.8,
      colorFrom: '#ffffff',
    };
    this.sparks = new Emitter({ ...burst, capacity: 6000, gravity: 160 }, rng);
    this.willow = new Emitter(
      {
        ...burst,
        capacity: 1500,
        gravity: 330,
        drag: 1,
        alphaOverLife: (u) => (1 - u) ** 0.7,
        twinkle: 0.4,
      },
      rng,
    );
    this.smoke = new Emitter(
      {
        capacity: 400,
        colorFrom: '#94a3b8',
        blend: 'normal',
        sizeOverLife: (u) => 0.5 + u * 2,
        alphaOverLife: (u) => 0.25 * (1 - u),
      },
      rng,
    );
    this.crackle = new Emitter(
      { capacity: 600, shape: 'spark', colorFrom: '#fff7d6', colorTo: '#f59e0b' },
      rng,
    );
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
    for (const e of [this.smoke, this.crackle, this.sparks, this.willow]) {
      e.step(dt);
      e.draw(gfx);
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
    this.blasts.push({ x, y, at: t, colour, pileY: rocket.footY });
    this.board.fx.shake(1.5, 150);
    const TAU = Math.PI * 2;
    const spark = (
      emitter: Emitter,
      angle: number,
      speed: number,
      life: number,
      size = 12,
      c: string = colour,
    ) =>
      emitter.burst(1, () => ({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        size,
        color: c,
        rotation: angle,
      }));
    const hot = (angle: number, speed: number) =>
      spark(this.sparks, angle, speed, 160, 8, '#ffffff');
    switch (rocket.style) {
      case 'peony':
        for (let k = 0; k < 300; k++) {
          const a = rng() * TAU;
          const v = 220 + 200 * rng();
          spark(this.sparks, a, v, 900 + 400 * rng());
          if (k % 5 === 0) hot(a, v);
        }
        break;
      case 'chrysanthemum':
        for (let k = 0; k < 200; k++) {
          const a = rng() * TAU;
          const v = 200 + 160 * rng();
          const life = 1100 + 300 * rng();
          spark(this.sparks, a, v, life);
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
          this.sparks.burst(1, () => ({
            x,
            y,
            vx,
            vy,
            life: 1000 + 200 * rng(),
            size: 12,
            color: colour,
            rotation: Math.atan2(vy, vx),
          }));
          if (k % 6 === 0) hot(Math.atan2(vy, vx), Math.hypot(vx, vy));
        }
        break;
      }
      case 'willow':
        for (let k = 0; k < 160; k++) {
          const a = rng() * TAU;
          spark(this.willow, a, 120 + 100 * rng(), 1500 + 600 * rng(), 10, '#fde68a');
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
          spark(this.sparks, a, v, life * 0.4);
          if (k % 4 === 0) hot(a, v);
        }
        break;
    }
    // The bright middle of it, for a moment.
    this.sparks.burst(1, () => ({ x, y, life: 140, size: 70, color: '#ffffff' }));
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
          this.sparks.burst(1, () => ({
            x: l.x,
            y: l.y,
            vx: l.vx * 0.3 + Math.cos(a) * 140,
            vy: l.vy * 0.3 + Math.sin(a) * 140,
            life: 700,
            size: 10,
            color: l.colour,
            rotation: a,
          }));
        }
        this.leaders.splice(k, 1);
      } else if (l.age >= l.life) this.leaders.splice(k, 1);
      else if (l.splitAt === 0) {
        this.crackle.burst(1, () => ({
          x: l.x,
          y: l.y,
          vx: (this.rng() - 0.5) * 30,
          vy: (this.rng() - 0.5) * 30,
          life: 350,
          size: 4,
          color: l.colour,
        }));
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
        hitStopMs: 0,
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
    const trail: number[] = [];
    for (let k = 0; k <= 10; k++) {
      const back = this.climbAt(rocket, Math.max(0, u - k * 0.03));
      trail.push(back.x, back.y);
    }
    gfx.ribbon(trail, (v) => 6 * (1 - v), rocket.colour, {
      alphaFrom: 0.7,
      alphaTo: 0,
      blend: 'add',
    });
    gfx.ribbon(trail, (v) => 2.5 * (1 - v), TRAIL, { alphaFrom: 0.8, alphaTo: 0, blend: 'add' });
    const { rng } = this;
    this.smoke.stream(50, dt, () => ({
      x: at.x + (rng() - 0.5) * 4,
      y: at.y + 4,
      vx: (rng() - 0.5) * 16,
      vy: -8 - 10 * rng(),
      life: 900,
      size: 10,
    }));
    this.crackle.stream(80, dt, () => ({
      x: at.x,
      y: at.y + 3,
      vx: (rng() - 0.5) * 90,
      vy: 40 + 90 * rng(),
      life: 300,
      size: 5,
      rotation: Math.PI / 2,
    }));
    gfx.glow(at.x, at.y, 14 * rocket.shell, rocket.colour);
    gfx.glow(at.x, at.y, 6, '#ffffff', { intensity: 1.4 });
    this.board.stamp(at.x, at.y, rocket.shell);
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
        this.crackle.burst(1, () => ({
          x: ix,
          y: iy,
          vx: (this.rng() - 0.5) * 60,
          vy: (this.rng() - 0.5) * 60,
          life: 300,
          size: 4,
          color: rocket.colour,
        }));
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
