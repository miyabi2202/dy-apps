import { type Board, pick, type Removal, type Remover } from '../board';
import { Crossing } from '../kit/crossing';
import { type Course, type Craft, type Pose } from '../kit/craft';
import { climbAway } from '../kit/climb-away';
import { Vacuum } from '../kit/vacuum';

/** The envelope's radius, the skirt below it, the lines down to the basket, and the basket. */
const R = 30;
const SKIRT = 12;
const LINES = 14;
const BASKET_W = 20;
const BASKET_H = 12;
const STRIPES = 8;

/** A balloon's colours: the envelope's stripes, taken in turn, the skirt, and the outline. */
export interface BalloonPalette {
  stripes: readonly string[];
  skirt: string;
  outline: string;
}

export const BALLOON_PALETTES: readonly BalloonPalette[] = [
  // Red and cream, the classic.
  { stripes: ['#f87171', '#fde68a'], skirt: '#b91c1c', outline: '#7f1d1d' },
  // Sky blue and white.
  { stripes: ['#38bdf8', '#f0f9ff'], skirt: '#0369a1', outline: '#0c4a6e' },
  // Sunset orange and pink.
  { stripes: ['#fb923c', '#f472b6'], skirt: '#be185d', outline: '#831843' },
  // Lavender.
  { stripes: ['#a78bfa', '#ede9fe'], skirt: '#6d28d9', outline: '#4c1d95' },
  // Mint and lemon.
  { stripes: ['#34d399', '#fef9c3'], skirt: '#047857', outline: '#064e3b' },
  // Rainbow.
  { stripes: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'], skirt: '#334155', outline: '#1e293b' },
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

  constructor({ palettes = BALLOON_PALETTES }: Options = {}) {
    this.palettes = palettes;
    this.palette = palettes[0]!;
  }

  /** Picks this crossing's colours, then sets off. */
  begin(board: Board, now: number, rng: () => number): Removal {
    this.palette = pick(this.palettes, rng);
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

  /** Centred on the envelope. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const r = R;
    const { stripes, skirt, outline } = this.palette;
    // The skirt first, so the envelope covers its top.
    const throatY = y + r + SKIRT;
    ctx.fillStyle = skirt;
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
    for (let i = 0; i < STRIPES; i++) {
      const x0 = x - r * Math.cos((i * Math.PI) / STRIPES);
      const x1 = x - r * Math.cos(((i + 1) * Math.PI) / STRIPES);
      ctx.fillStyle = stripes[i % stripes.length]!;
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
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // The lines from the throat to the basket, and the basket.
    const basketY = throatY + LINES;
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
}
