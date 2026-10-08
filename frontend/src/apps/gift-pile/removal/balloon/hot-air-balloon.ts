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
import { balloonPortrait } from './portrait';
import { BALLOON_SHADERS, drawBalloonShader } from './shader';

/** The envelope's radius, the skirt below it, the lines down to the basket, and the basket. */
const R = 30;
const SKIRT = 12;
const LINES = 14;
const BASKET_W = 20;
const BASKET_H = 12;
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
  /** Compiled when the page opens. */
  readonly shaders = BALLOON_SHADERS;
  /** Each palette's cut-in portrait, painted ahead of time. */
  readonly sprites: readonly SpriteSource[];
  private readonly portraits = new Map<BalloonPalette, SpriteSource>();
  /** Burner sparks, sparkle dust and streamers for this crossing. */
  private fx = new BalloonFx(() => 0.5);

  constructor({ palettes = BALLOON_PALETTES }: Options = {}) {
    this.palettes = palettes;
    this.palette = palettes[0]!;
    this.sprites = palettes.map((palette) => {
      const source = balloonPortrait(palette);
      this.portraits.set(palette, source);
      return source;
    });
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
    return {
      name: this.name,
      color: '#fb923c',
      portrait: this.portraits.get(this.palette)!,
      shake: 0,
    };
  }

  /** Centred on the envelope. */
  draw(gfx: Gfx, x: number, y: number, _tilt: number, t: number): void {
    const { palette } = this;
    this.fx.draw(gfx, x, y, t, palette);
    drawBalloonShader(gfx, x, y, R, {
      stripes: palette.stripes,
      skirt: palette.skirt,
      outline: palette.outline,
      pattern: palette.pattern,
      heat: this.fx.heat,
      burn: this.fx.burn(t),
    });
    this.fx.drawBurner(gfx, x, y, t);
  }
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
