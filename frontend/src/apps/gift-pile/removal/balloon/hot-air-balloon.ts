import {
  type Board,
  type CutInRequest,
  type Gfx,
  pick,
  type Removal,
  type Remover,
  type SpriteSource,
} from '../board';
import { Crossing } from '../kit/crossing';
import { type Course, type Craft, type Pose } from '../kit/craft';
import { climbAway } from '../kit/climb-away';
import { Vacuum } from '../kit/vacuum';
import { Frames } from '../kit/clock';
import { Emitter } from '../kit/particles';
import { Wake } from '../kit/trail';
import { sparkBurst } from '../kit/fx';

/** The envelope's radius, the skirt below it, the lines down to the basket, and the basket. */
const R = 30;
const SKIRT = 12;
const LINES = 14;
const BASKET_W = 20;
const BASKET_H = 12;
/** The portrait is this big. */
const PORTRAIT = 64;

/** The burner fires for this long every this long. */
const WHOOSH_MS = 350;
const WHOOSH_EVERY_MS = 1300;
/** Streamers trail from the basket's corners and middle, this far back in time. */
const STREAMER_MS = 700;

/** A balloon's colours: the envelope's stripes, taken in turn, the skirt, and the outline; and what is painted on the gores. */
export interface BalloonPalette {
  stripes: readonly string[];
  skirt: string;
  outline: string;
  pattern?: 'plain' | 'bands' | 'chevrons' | 'stars';
}

export const BALLOON_PALETTES: readonly BalloonPalette[] = [
  // Red and cream, the classic.
  { stripes: ['#f87171', '#fde68a'], skirt: '#b91c1c', outline: '#7f1d1d', pattern: 'chevrons' },
  // Sky blue and white.
  { stripes: ['#38bdf8', '#f0f9ff'], skirt: '#0369a1', outline: '#0c4a6e', pattern: 'bands' },
  // Sunset orange and pink.
  { stripes: ['#fb923c', '#f472b6'], skirt: '#be185d', outline: '#831843', pattern: 'stars' },
  // Lavender.
  { stripes: ['#a78bfa', '#ede9fe'], skirt: '#6d28d9', outline: '#4c1d95', pattern: 'chevrons' },
  // Mint and lemon.
  { stripes: ['#34d399', '#fef9c3'], skirt: '#047857', outline: '#064e3b', pattern: 'bands' },
  // Rainbow.
  {
    stripes: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'],
    skirt: '#334155',
    outline: '#1e293b',
    pattern: 'plain',
  },
];

interface Options {
  /** The colours to pick from for each crossing; the first until the first pick. */
  palettes?: readonly BalloonPalette[];
}

/** A hot-air balloon: drifts over slowly with a lazy bob, then rises away without tilting. */
export class HotAirBalloon implements Craft, Remover {
  readonly name = 'balloon';
  readonly crossMs = 5600;
  /** The rope ties on under the basket. */
  readonly tie = { dx: 0, dy: R + SKIRT + LINES + BASKET_H };
  readonly intake = new Vacuum();
  private readonly palettes: readonly BalloonPalette[];
  private palette: BalloonPalette;
  /** Each palette's portrait. */
  private readonly portraits = new Map<BalloonPalette, SpriteSource>();
  /** Burner sparks, sparkle dust and streamers for this crossing. */
  private fx = new BalloonFx(() => 0.5);

  constructor({ palettes = BALLOON_PALETTES }: Options = {}) {
    this.palettes = palettes;
    this.palette = palettes[0]!;
  }

  /** Picks this crossing's colours, then sets off. */
  begin(board: Board, now: number, rng: () => number): Removal {
    this.palette = pick(this.palettes, rng);
    this.fx = new BalloonFx(rng);
    return new Crossing(this, board, now, rng);
  }

  minY(): number {
    return R + 8;
  }

  sag(): number {
    return 0;
  }

  pathAt(course: Course, px: number, t: number): Pose {
    const { climb } = climbAway(course, px);
    return { py: course.altitude - climb + Math.sin(t / 420) * 4, tilt: 0 };
  }

  /** Soon after it floats into view. */
  cutInAt(course: Course): number {
    return course.width * 0.15;
  }

  /** Calm: no freeze-frame or shake. */
  cutInRequest(): CutInRequest {
    return { name: this.name, color: '#fb923c', portrait: this.portrait(), shake: 0 };
  }

  /** Centred on the envelope. */
  draw(gfx: Gfx, x: number, y: number, _tilt: number, t: number): void {
    const { palette } = this;
    this.fx.draw(gfx, x, y, t, palette);
    gfx.hotAirBalloon(x, y, R, {
      stripes: palette.stripes,
      skirt: palette.skirt,
      outline: palette.outline,
      pattern: palette.pattern,
      heat: this.fx.heat,
      burn: this.fx.burn(t),
    });
    this.fx.drawBurner(gfx, x, y, t);
  }

  /** The balloon's picture for the cut-in banner, made once for each palette. */
  private portrait(): SpriteSource {
    let source = this.portraits.get(this.palette);
    if (!source) {
      const { palette } = this;
      source = {
        key: `portrait/balloon/${palette.stripes.join('')}/${palette.skirt}/${palette.outline}/${palette.pattern ?? ''}`,
        width: PORTRAIT,
        height: PORTRAIT,
        paint: (ctx) => paintPortrait(ctx, palette),
      };
      this.portraits.set(palette, source);
    }
    return source;
  }
}

/** The balloon for the banner: a silk envelope of gores, lit warm from inside, over its ropes and a woven basket. */
function paintPortrait(ctx: CanvasRenderingContext2D, palette: BalloonPalette): void {
  const { stripes, skirt, outline, pattern } = palette;
  const cx = PORTRAIT / 2;
  const cy = 24;
  const r = 20;
  const throatY = cy + r * 1.4;
  // The skirt first, so the envelope covers its top.
  ctx.fillStyle = skirt;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.6, cy + r * 0.8);
  ctx.lineTo(cx + r * 0.6, cy + r * 0.8);
  ctx.lineTo(cx + r * 0.2, throatY);
  ctx.lineTo(cx - r * 0.2, throatY);
  ctx.closePath();
  ctx.fill();
  // The gores, narrowing towards the sides as on a sphere, in a warm glow.
  ctx.save();
  ctx.shadowColor = 'rgba(251, 146, 60, 0.9)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = skirt;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();
  const gores = 8;
  for (let i = 0; i < gores; i++) {
    const x0 = cx - r * Math.cos((i * Math.PI) / gores);
    const x1 = cx - r * Math.cos(((i + 1) * Math.PI) / gores);
    ctx.fillStyle = stripes[i % stripes.length]!;
    ctx.fillRect(x0, cy - r, x1 - x0, 2 * r);
  }
  // What is painted on them.
  ctx.fillStyle = 'rgba(255, 247, 224, 0.9)';
  if (pattern === 'bands') {
    ctx.fillRect(cx - r, cy - r * 0.05, 2 * r, r * 0.15);
  } else if (pattern === 'chevrons') {
    ctx.strokeStyle = 'rgba(255, 247, 224, 0.9)';
    ctx.lineWidth = 3;
    for (let i = 0; i < gores; i++) {
      const xa = cx - r * Math.cos((i * Math.PI) / gores);
      const xb = cx - r * Math.cos(((i + 1) * Math.PI) / gores);
      ctx.beginPath();
      ctx.moveTo(xa, cy + r * 0.1);
      ctx.lineTo((xa + xb) / 2, cy + r * 0.28);
      ctx.lineTo(xb, cy + r * 0.1);
      ctx.stroke();
    }
  } else if (pattern === 'stars') {
    for (let i = 0; i < gores; i += 2) {
      const xa = cx - r * Math.cos(((i + 0.5) * Math.PI) / gores);
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 === 0 ? 3.6 : 1.5;
        ctx.lineTo(xa + Math.cos(a) * rr, cy - r * 0.15 + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  // Seams, the light inside, and a silk highlight up on the left.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < gores; i++) {
    const x = cx - r * Math.cos((i * Math.PI) / gores);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(x + (x - cx) * 0.25, cy, cx + (x - cx) * 0.5, cy + r * 1.1);
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(cx, cy + r * 0.8, 1, cx, cy + r * 0.5, r * 1.1);
  glow.addColorStop(0, 'rgba(255, 190, 90, 0.8)');
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r, cy - r, 2 * r, 3 * r);
  const shine = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx, cy, r);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  shine.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  shine.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
  ctx.fillStyle = shine;
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  ctx.restore();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // The ropes and the basket, woven.
  const basketY = throatY + 7;
  const half = 7;
  ctx.strokeStyle = '#fde9c0';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.2, throatY);
  ctx.lineTo(cx - half + 1, basketY);
  ctx.moveTo(cx + r * 0.2, throatY);
  ctx.lineTo(cx + half - 1, basketY);
  ctx.stroke();
  ctx.fillStyle = '#c2813a';
  ctx.strokeStyle = '#5b3410';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(cx - half, basketY, 2 * half, 8, 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(91, 52, 16, 0.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let k = 1; k < 3; k++) {
    ctx.moveTo(cx - half + 1, basketY + k * 2.6);
    ctx.lineTo(cx + half - 1, basketY + k * 2.6);
  }
  ctx.stroke();
  ctx.fillStyle = '#5b3410';
  ctx.fillRect(cx - half, basketY, 2 * half, 1.8);
  // The flame.
  ctx.shadowColor = '#fb923c';
  ctx.shadowBlur = 8;
  const flame = ctx.createLinearGradient(0, throatY, 0, throatY - 11);
  flame.addColorStop(0, '#60a5fa');
  flame.addColorStop(0.3, '#fff7ed');
  flame.addColorStop(1, '#f97316');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(cx - 2.2, throatY + 1);
  ctx.quadraticCurveTo(cx - 3, throatY - 6, cx, throatY - 11);
  ctx.quadraticCurveTo(cx + 3, throatY - 6, cx + 2.2, throatY + 1);
  ctx.closePath();
  ctx.fill();
}

/** The balloon's burner flame, sparkle dust and streamers. */
class BalloonFx {
  private readonly frames = new Frames();
  private readonly sparks: Emitter;
  private readonly dust: Emitter;
  private readonly streamers = [
    new Wake(STREAMER_MS),
    new Wake(STREAMER_MS),
    new Wake(STREAMER_MS),
  ];
  private whooshes = -1;
  /** How warm the envelope is: the burner heats it fast, and it cools slowly. */
  heat = 0;

  constructor(private readonly rng: () => number) {
    this.sparks = new Emitter(
      { capacity: 120, shape: 'star', colorFrom: '#fff7ed', colorTo: '#fb923c', drag: 1.2 },
      rng,
    );
    this.dust = new Emitter(
      {
        capacity: 120,
        shape: 'star',
        colorFrom: '#ffffff',
        colorTo: '#fde68a',
        twinkle: 1,
        alphaOverLife: (u) => Math.sin(Math.PI * u),
        sizeOverLife: () => 1,
      },
      rng,
    );
  }

  /** Behind the balloon: the dust round it and the streamers from its basket. */
  draw(gfx: Gfx, x: number, y: number, t: number, palette: BalloonPalette): void {
    const { rng } = this;
    const dt = this.frames.dt(t);
    const burn = this.burn(t);
    this.heat += (burn - this.heat) * (1 - Math.exp(-dt / (burn > this.heat ? 90 : 500)));
    this.dust.stream(8, dt, () => {
      const a = rng() * Math.PI * 2;
      const r = R * (0.6 + 0.9 * rng());
      return {
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: (rng() - 0.5) * 8,
        vy: -4 - 8 * rng(),
        life: 1200,
        size: 5 + 4 * rng(),
        rotation: rng() * Math.PI,
      };
    });
    this.sparks.step(dt);
    this.dust.step(dt);
    this.dust.draw(gfx);

    // Streamers from the basket: left corner, middle, right corner.
    const basketY = y + R + SKIRT + LINES + BASKET_H;
    this.streamers.forEach((wake, k) => {
      wake.add(x + (k - 1) * (BASKET_W / 2 - 1), basketY - 2, t);
      const points = [...wake.points()];
      for (let i = 0; i < points.length / 2; i++) {
        const u = i / Math.max(1, points.length / 2 - 1);
        points[2 * i + 1] =
          points[2 * i + 1]! + Math.sin(t / 160 + k * 1.7 + i * 0.5) * 4 * u + u * 6;
      }
      gfx.ribbon(points, 3, palette.stripes[k % palette.stripes.length]!, {
        alphaFrom: 0.9,
        alphaTo: 0,
      });
    });
    this.sparks.draw(gfx);
  }

  /** How hard the burner fires, 0 to 1: a pulse every 1.3 s. */
  burn(t: number): number {
    const phase = t % WHOOSH_EVERY_MS;
    return phase < WHOOSH_MS ? Math.sin((Math.PI * phase) / WHOOSH_MS) : 0;
  }

  /** In front of it: the burner's whoosh at the throat, firing a flame every 1.3 s. */
  drawBurner(gfx: Gfx, x: number, y: number, t: number): void {
    const throat = { x, y: y + R + SKIRT - 2 };
    const phase = t % WHOOSH_EVERY_MS;
    const count = Math.floor(t / WHOOSH_EVERY_MS);
    if (phase < WHOOSH_MS) {
      const u = phase / WHOOSH_MS;
      if (count !== this.whooshes) {
        this.whooshes = count;
        sparkBurst(this.sparks, throat.x, throat.y - 4, '#fff7ed', 12, {
          speed: 80,
          life: 400,
          size: 6,
        });
      }
      const burn = Math.sin(Math.PI * u);
      gfx.glow(throat.x, throat.y, 18 + 8 * u, '#fb923c', { intensity: 1.2 * burn });
      gfx.glow(throat.x, throat.y - 2, 6, '#60a5fa', { intensity: 1.2 * burn });
      // The envelope lit warm from inside.
      gfx.glow(throat.x, y + R * 0.2, R * 0.9, '#fdba74', { intensity: 0.3 * burn });
    }
  }
}
