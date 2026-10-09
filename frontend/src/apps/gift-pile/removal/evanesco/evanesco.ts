import {
  type Board,
  type Gfx,
  type Material,
  pick,
  type Point,
  type Removal,
  type Remover,
  type ScoopShape,
  type SpriteSource,
} from '../board';
import { wizardPortrait } from './portrait';
import { Puffs } from './puffs';
import {
  BRISTLES,
  drawRider,
  IDLE,
  type Pose,
  RIDER,
  SHOULDER,
  toWorld,
  wandOf,
  WOUND_UP,
} from './rider';
import { drawBolt, EVANESCO_SHADERS } from './shader';
import { easeOut, smooth } from '../kit/easing';
import { clumpOf, clumpSomewhere } from '../kit/clump';
import { Frames } from '../kit/clock';
import { Emitter } from '../kit/particles';
import { Wake } from '../kit/trail';
import { sparkBurst } from '../kit/fx';

// Timing in ms, geometry in world pixels.
/** He hovers with his hip this far above the top of the clump and this far to its left, but no nearer the view's top than this. */
const HOVER_ABOVE = 125;
const STAND_OFF = 95;
const HOVER_MIN_Y = 70;
/** He flies in over this long, winds up over this long, and swishes and flicks the wand over this long. */
const ARRIVE_MS = 1400;
const WIND_UP_MS = 380;
const SWISH_MS = 420;
/** The bolt takes this long from the wand to the pile, and fades over this long once it hits. */
const BOLT_MS = 200;
const BOLT_FADE_MS = 220;
/** The spell spreads out from where the bolt hit over this long, each icon caught a little earlier or later. */
const SPREAD_MS = 900;
const CATCH_JITTER_MS = 140;
/** How long an icon takes to vanish once caught. */
const VANISH_MIN_MS = 380;
const VANISH_MORE_MS = 220;
/** It glows and swells for this share of that, then shrinks to nothing. */
const LIT_SHARE = 0.55;
/** A dud shakes the spell off this far through its vanishing, and jumps clear. */
const DUD_AT = 0.5;
/** He waits this long once the last is gone, lowering his wand, then flies off over this long. */
const PAUSE_MS = 350;
const ESCAPE_MS = 1000;
/** How much an icon swells as the spell takes it, and how far it rises. */
const SWELL = 0.12;
const RISE = 4;
/** Where he can aim, as fractions of the canvas's width. */
const AIM_FROM = 0.2;
const AIM_TO = 0.85;

/** The colour of the spell's light: the bolt, the sparks and the glow at the wand's tip. */
export const SPELL_LIGHTS: readonly string[] = [
  // Gold, the first.
  '#ffd56b',
  // Ice blue.
  '#8fd8ff',
  // Violet.
  '#c9a7ff',
  // Moonlight silver.
  '#e6eeff',
];

interface Options {
  /** The spell colours to pick from for each casting; the first until the first pick. */
  lights?: readonly string[];
}

/**
 * A wizard on his broom: flies in, stops over a clump of the pile, swishes and flicks his
 * wand and casts the Vanishing Spell, Evanesco. The bolt hits the clump and the spell spreads
 * out through it from there: each icon glows with it, shrinks to nothing and is gone in a small
 * puff of black smoke. The duds shake the spell off
 * and jump clear. Then he flies off.
 */
export class Evanesco implements Remover {
  readonly name = 'evanesco';
  /** Compiled when the page opens. */
  readonly shaders = EVANESCO_SHADERS;
  /** Him on his broom and his cut-in portraits, painted ahead of time. */
  readonly sprites: readonly SpriteSource[];
  private readonly lights: readonly string[];

  constructor({ lights = SPELL_LIGHTS }: Options = {}) {
    this.lights = lights;
    this.sprites = [RIDER, ...lights.map(wizardPortrait)];
  }

  /** A clump of the pile somewhere across it. */
  shape(rng: () => number): ScoopShape {
    return clumpSomewhere(rng, AIM_FROM, AIM_TO);
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Casting(board, now, rng, pick(this.lights, rng));
  }
}

/** Where he is and how he sits on the broom. */
interface Flight {
  x: number;
  y: number;
  tilt: number;
  speed: number;
}

/** One frame's vanishing icons (where, how big, how lit) and duds (where, how bright). */
interface Vanishing {
  x: Float32Array;
  y: Float32Array;
  scale: Float32Array;
  lit: Float32Array;
  dudX: Float32Array;
  dudY: Float32Array;
  dudGlow: Float32Array;
}

/** One visit. */
class Casting implements Removal {
  private readonly t0: number;
  /** Where he hovers, by his hip, and where the bolt hits. */
  private readonly hoverX: number;
  private readonly hoverY: number;
  private readonly hit: Point;
  /** The angle from his shoulder to where the bolt hits, in his own frame as he hovers. */
  private readonly aim: number;
  /** When each phase ends, in ms after `t0`. */
  private readonly wound: number;
  private readonly swished: number;
  private readonly impact: number;
  private readonly lastOut: number;
  private readonly leave: number;
  private readonly done: number;
  /** When the spell catches each icon and how long it takes to vanish, where it was, and a seed for its shiver. */
  private readonly catchAt: Float32Array;
  private readonly vanishMs: Float32Array;
  private readonly fromX: Float32Array;
  private readonly fromY: Float32Array;
  private readonly seed: Float32Array;
  /** Which icons shake the spell off, and which are gone or dropped. */
  private readonly dud: Uint8Array;
  private readonly finished: Uint8Array;
  /** This frame's vanishing icons and duds, gathered so each layer of them is drawn in one go. */
  private readonly vanishing: Vanishing;
  /** The spell's light over an icon it has caught. */
  private readonly glowing: Material;
  private introduced = false;
  private struck = false;
  private readonly sparks: Emitter;
  private readonly glitter: Emitter;
  private readonly smoke: Puffs;
  private readonly rng: () => number;
  private readonly frames = new Frames();
  /** Where the wand's tip and the broom's tail have been, for the swish's streak and the flight's. */
  private readonly tipWake = new Wake(220);
  private readonly broomWake = new Wake(380);

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    private readonly light: string,
  ) {
    const { icons, world, iconRadius, camera } = board;
    const n = icons.length;
    this.rng = rng;
    this.t0 = now;
    this.glowing = { kind: 'solid', color: light };
    this.sparks = new Emitter(
      { capacity: 300, shape: 'star', colorFrom: '#ffffff', colorTo: light, drag: 2.4 },
      rng,
    );
    this.glitter = new Emitter(
      {
        capacity: 260,
        shape: 'star',
        colorFrom: '#fff3c4',
        colorTo: '#eeba30',
        gravity: 25,
        twinkle: 0.7,
      },
      rng,
    );
    this.smoke = new Puffs(260, rng);

    const { x, top } = clumpOf(icons, world, 40);
    this.hit = { x, y: top + iconRadius * 0.5 };
    this.hoverX = Math.min(world.width - 140, Math.max(95, x - STAND_OFF));
    this.hoverY = Math.max(camera.view.top + HOVER_MIN_Y, top - HOVER_ABOVE);
    this.aim = Math.atan2(
      this.hit.y - (this.hoverY + SHOULDER.y),
      this.hit.x - (this.hoverX + SHOULDER.x),
    );

    this.wound = ARRIVE_MS + WIND_UP_MS;
    this.swished = this.wound + SWISH_MS;
    this.impact = this.swished + BOLT_MS;

    this.catchAt = new Float32Array(n);
    this.vanishMs = new Float32Array(n);
    this.fromX = new Float32Array(n);
    this.fromY = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.dud = new Uint8Array(n);
    this.finished = new Uint8Array(n);
    let far = 1;
    for (const p of icons) far = Math.max(far, Math.hypot(p.x - this.hit.x, p.y - this.hit.y));
    let lastOut = this.impact;
    icons.forEach((p, i) => {
      // The spell reaches the nearest first, spreading out like a ripple.
      const d = Math.hypot(p.x - this.hit.x, p.y - this.hit.y) / far;
      this.catchAt[i] = this.impact + SPREAD_MS * d ** 0.8 + CATCH_JITTER_MS * rng();
      this.vanishMs[i] = VANISH_MIN_MS + VANISH_MORE_MS * rng();
      this.fromX[i] = p.x;
      this.fromY[i] = p.y;
      this.seed[i] = rng() * 40;
      lastOut = Math.max(lastOut, this.catchAt[i] + this.vanishMs[i]);
    });
    // The duds, spread through the clump.
    for (let k = 0; k < board.dropCount; k++) this.dud[Math.floor((k * n) / board.dropCount)] = 1;
    this.lastOut = lastOut;
    this.leave = lastOut + PAUSE_MS;
    this.done = this.leave + ESCAPE_MS;

    this.vanishing = {
      x: new Float32Array(n),
      y: new Float32Array(n),
      scale: new Float32Array(n),
      lit: new Float32Array(n),
      dudX: new Float32Array(n),
      dudY: new Float32Array(n),
      dudGlow: new Float32Array(n),
    };
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  draw(gfx: Gfx, now: number): void {
    const t = now - this.t0;
    const { board } = this;
    const dt = this.frames.dt(now);
    const flight = this.flightAt(t);
    const pose = this.poseAt(t);
    const tip = toWorld(wandOf(pose).tip, flight.x, flight.y, flight.tilt);
    const tail = toWorld(BRISTLES, flight.x, flight.y, flight.tilt);
    this.tipWake.add(tip.x, tip.y, t);
    this.broomWake.add(tail.x, tail.y, t);

    // As he stops over the clump, the cut-in, before he casts.
    if (!this.introduced && t >= ARRIVE_MS) {
      this.introduced = true;
      board.fx.cutIn({
        name: 'evanesco',
        color: '#eeba30',
        portrait: wizardPortrait(this.light),
      });
    }

    // The broom's trail of golden sparkle, as he flies.
    if (flight.speed > 0.15) {
      gfx.ribbon(this.broomWake.points(), (v) => 7 * (1 - v), '#eeba30', {
        blend: 'add',
        alphaFrom: 0.45 * flight.speed,
        alphaTo: 0,
      });
      this.glitter.stream(70 * flight.speed, dt, () => ({
        x: tail.x + (this.rng() - 0.5) * 8,
        y: tail.y + (this.rng() - 0.5) * 10,
        vx: (this.rng() - 0.5) * 30,
        vy: (this.rng() - 0.5) * 30,
        life: 500 + 400 * this.rng(),
        size: 5 + 4 * this.rng(),
      }));
    }

    this.drawVanishing(gfx, t);
    this.drawSpell(gfx, t, dt, tip);

    this.smoke.step(dt);
    this.smoke.draw(gfx);
    this.glitter.step(dt);
    this.glitter.draw(gfx);

    // Flying off: speed lines as he goes.
    if (t >= this.leave && t - this.leave > ESCAPE_MS - 450) {
      gfx.speedLines(flight.x, flight.y, { alpha: 0.3 });
    }

    drawRider(gfx, flight.x, flight.y, { tilt: flight.tilt, pose, speed: flight.speed, t });
    // The light at his wand's tip, over his hand.
    const lit = this.tipLight(t);
    if (lit > 0) {
      gfx.glow(tip.x, tip.y, 16 + 6 * lit, this.light, { intensity: 0.9 * lit });
      gfx.circle(tip.x, tip.y, 1.8 + lit, '#ffffff', { alpha: lit, blend: 'add' });
    }
    this.sparks.step(dt);
    this.sparks.draw(gfx);
  }

  /** The swish's streak, the bolt, and the flash where it hits. */
  private drawSpell(gfx: Gfx, t: number, dt: number, tip: Point): void {
    const { board, light, hit } = this;
    // The streak the wand's tip leaves as it swishes and flicks.
    if (t >= this.wound && t < this.swished + 200) {
      const fade = t < this.swished ? 1 : 1 - (t - this.swished) / 200;
      gfx.ribbon(this.tipWake.points(), (v) => 6 * (1 - v), light, {
        blend: 'add',
        alphaFrom: 0.9 * fade,
        alphaTo: 0,
      });
    }
    // Sparks off the tip as he holds the spell on the clump.
    if (t >= this.swished && t < this.lastOut) {
      this.sparks.stream(30, dt, () => ({
        x: tip.x,
        y: tip.y,
        vx: (this.rng() - 0.5) * 80,
        vy: (this.rng() - 0.5) * 80,
        life: 350 + 250 * this.rng(),
        size: 6 + 4 * this.rng(),
      }));
    }
    // The bolt: shot from the tip, then fading where it struck.
    if (t >= this.swished && t < this.impact + BOLT_FADE_MS) {
      const u = Math.min(1, (t - this.swished) / BOLT_MS);
      const e = u * u;
      const head = { x: tip.x + (hit.x - tip.x) * e, y: tip.y + (hit.y - tip.y) * e };
      const strength = t < this.impact ? 1 : 1 - (t - this.impact) / BOLT_FADE_MS;
      drawBolt(gfx, tip.x, tip.y, head.x, head.y, 9, strength, light);
    }
    if (t >= this.impact && !this.struck) {
      this.struck = true;
      board.fx.shake(5, 320);
      board.fx.hitStop(70);
      sparkBurst(this.sparks, hit.x, hit.y, light, 26, { speed: 360, life: 650, size: 9 });
    }
    if (t >= this.impact) {
      const since = t - this.impact;
      if (since < 220) gfx.flash(light, 0.18 * (1 - since / 220));
      if (since < 260) gfx.aberration(0.5 * (1 - since / 260));
      if (since < 500) {
        const u = since / 500;
        gfx.shockwave(hit.x, hit.y, 150 * easeOut(u), 26, 12 * (1 - u));
        gfx.glow(hit.x, hit.y, 70 + 50 * u, light, { intensity: 1.3 * (1 - u) });
        gfx.ring(hit.x, hit.y, 20 + 110 * easeOut(u), 3 * (1 - u) + 0.5, light, {
          alpha: 0.8 * (1 - u),
          blend: 'add',
        });
      }
    }
  }

  /** The icons the spell has caught: each trembling and swelling as it glows with it, then shrinking to nothing. */
  private drawVanishing(gfx: Gfx, t: number): void {
    const { board, vanishing: v, light } = this;
    const r = board.iconRadius;
    const n = board.icons.length;
    const low = gfx.quality === 'low';
    let nv = 0;
    let nd = 0;
    for (let i = 0; i < n; i++) {
      if (this.finished[i] || t < this.catchAt[i]!) continue;
      const at = board.take(i);
      if (at) {
        this.fromX[i] = at.x;
        this.fromY[i] = at.y;
      }
      const u = (t - this.catchAt[i]!) / this.vanishMs[i]!;
      const seed = this.seed[i]!;
      const shiver = Math.sin(t * 0.07 + seed) * 1.2 * (1 - Math.min(1, u));
      const x = this.fromX[i]! + shiver;
      const y = this.fromY[i]! - RISE * easeOut(u / LIT_SHARE);
      if (this.dud[i]) {
        if (u >= DUD_AT) {
          // It shakes the spell off and jumps clear, back onto the pile.
          this.finished[i] = 1;
          const vx = (this.rng() - 0.5) * 160;
          board.drop(i, x, y, vx, -(140 + 100 * this.rng()));
          sparkBurst(this.sparks, x, y, light, 8, { speed: 200, life: 400, size: 6 });
          continue;
        }
        // Glowing with the spell it is fighting off.
        v.dudX[nd] = x;
        v.dudY[nd] = y;
        v.dudGlow[nd++] = (0.35 + 0.3 * Math.sin(t * 0.03 + seed)) * smooth(u / 0.2);
        continue;
      }
      if (u >= 1) {
        // Gone, in a small puff of black smoke.
        this.finished[i] = 1;
        board.destroy(i);
        this.vanish(x, y, r, low);
        continue;
      }
      // Swelling a little as the spell takes it, then shrinking fast to nothing.
      const lit = smooth(u / LIT_SHARE);
      const squeeze = Math.max(0, (u - LIT_SHARE) / (1 - LIT_SHARE));
      v.x[nv] = x;
      v.y[nv] = y;
      v.scale[nv] = (1 + SWELL * lit) * (1 - squeeze * squeeze);
      v.lit[nv++] = lit;
    }
    // Each layer in one go, so each is one run of draws: the spell's glow behind them all, the
    // icons, and its light added over them.
    for (let k = 0; k < nd; k++) {
      gfx.glow(v.dudX[k]!, v.dudY[k]!, r * 2.2, light, { intensity: v.dudGlow[k]! });
    }
    for (let k = 0; k < nv; k++) {
      gfx.glow(v.x[k]!, v.y[k]!, r * 2 * Math.max(0.5, v.scale[k]!), light, {
        intensity: 0.2 * v.lit[k]!,
      });
    }
    for (let k = 0; k < nd; k++) board.stamp(v.dudX[k]!, v.dudY[k]!);
    for (let k = 0; k < nv; k++) board.stamp(v.x[k]!, v.y[k]!, v.scale[k]);
    for (let k = 0; k < nv; k++) {
      gfx.icon(v.x[k]!, v.y[k]!, v.scale[k], {
        material: this.glowing,
        alpha: 0.3 * v.lit[k]!,
        blend: 'add',
      });
    }
  }

  /** The end of one icon: a small puff of black smoke, and a glint or two of the spell. */
  private vanish(x: number, y: number, r: number, low: boolean): void {
    const { rng } = this;
    if (!low || rng() < 0.5) {
      this.smoke.add({
        x,
        y,
        vx: (rng() - 0.5) * 24,
        vy: -(20 + 20 * rng()),
        life: 700 + 300 * rng(),
        from: r * 0.7,
        to: r * (1.6 + 0.6 * rng()),
      });
    }
    sparkBurst(this.sparks, x, y, this.light, low ? 1 : 3, { speed: 90, life: 450, size: 5 });
  }

  /** How brightly his wand's tip shines at `t`, 0 to 1: from the wind-up to when he lowers it. */
  private tipLight(t: number): number {
    if (t < ARRIVE_MS) return 0;
    if (t < this.wound) return 0.4 * smooth((t - ARRIVE_MS) / WIND_UP_MS);
    if (t < this.impact) return 1;
    if (t < this.lastOut) return 0.7 + 0.15 * Math.sin(t * 0.02);
    return 0.7 * (1 - smooth((t - this.lastOut) / PAUSE_MS));
  }

  /** How he holds his wand at `t`: forward as he flies, wound up, swished down at the clump, held on it, lowered. */
  private poseAt(t: number): Pose {
    const aimed: Pose = { arm: this.aim, wand: this.aim };
    if (t < ARRIVE_MS) return IDLE;
    if (t < this.wound) return blend(IDLE, WOUND_UP, smooth((t - ARRIVE_MS) / WIND_UP_MS));
    if (t < this.swished) {
      // The swish over his head and down, and the flick of the wrist at its end.
      const s = (t - this.wound) / SWISH_MS;
      const arm = WOUND_UP.arm + (this.aim - WOUND_UP.arm) * smooth(s);
      const flick = -0.7 * Math.sin(Math.PI * Math.min(1, Math.max(0, (s - 0.55) / 0.45)));
      const lag = (WOUND_UP.wand - WOUND_UP.arm) * (1 - smooth(s * 1.4));
      return { arm, wand: arm + lag + flick };
    }
    if (t < this.lastOut) {
      const tremble = Math.sin(t * 0.045) * 0.025;
      return { arm: this.aim + tremble, wand: this.aim + tremble * 1.5 };
    }
    return blend(aimed, IDLE, smooth((t - this.lastOut) / PAUSE_MS));
  }

  /** Where he is at `t`: swooping in from the top left, hovering, then swooping off to the top right. */
  private flightAt(t: number): Flight {
    const { width } = this.board.world;
    const viewTop = this.board.camera.view.top;
    if (t < ARRIVE_MS) {
      const u = t / ARRIVE_MS;
      const e = easeOut(u);
      const fromY = viewTop + 60;
      // Diving in nose down, then pulling up to stop, leaning back on the broom.
      const flare = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.55) / 0.45)));
      return {
        x: -100 + (this.hoverX + 100) * e,
        y: fromY + (this.hoverY - fromY) * e + Math.sin(Math.PI * u) * 40,
        tilt: 0.2 * (1 - u) - 0.22 * flare,
        speed: 1 - smooth(u),
      };
    }
    const bob = Math.sin(t / 380) * 3;
    if (t < this.leave) {
      // The swish rocks him back a little on the broom.
      const swish =
        t >= this.wound && t < this.swished ? Math.sin((Math.PI * (t - this.wound)) / SWISH_MS) : 0;
      return {
        x: this.hoverX + Math.sin(t / 900) * 2,
        y: this.hoverY + bob,
        tilt: Math.sin(t / 520) * 0.03 - 0.07 * swish,
        speed: 0.1,
      };
    }
    // A swoop down and off, climbing away to the top right ever faster.
    const u = Math.min(1, (t - this.leave) / ESCAPE_MS);
    const dip = u < 0.5 ? 26 * Math.sin(Math.PI * u * 2) : 0;
    const climb = (this.hoverY - (viewTop - 90)) * smooth((u - 0.2) / 0.8);
    return {
      x: this.hoverX + (width + 130 - this.hoverX) * u * u,
      y: this.hoverY + bob + dip - climb,
      tilt: u < 0.25 ? 0.15 * Math.sin((Math.PI * u) / 0.25) : -0.32 * smooth((u - 0.25) / 0.3),
      speed: Math.min(1, u * 3),
    };
  }
}

/** Partway from pose `a` to `b`. */
function blend(a: Pose, b: Pose, u: number): Pose {
  return { arm: a.arm + (b.arm - a.arm) * u, wand: a.wand + (b.wand - a.wand) * u };
}
