import { type Board, pick, type Removal, type Remover } from '../board';
import { type Course, type Craft, type Pose } from '../kit/craft';
import { Crossing } from '../kit/crossing';
import { Mouth } from '../kit/mouth';

/** The wave it snakes along: how far up and down, and how long, in world pixels. */
const WAVE = 14;
const WAVELENGTH = 230;
/** Its body: this many segments, this far apart along x, from this thick behind the head to this at the tail. */
const SEGMENTS = 12;
const SPACING = 13;
const THICK = 10;
const THIN = 4.5;
/** The flaming pearl it chases, this far ahead of its head. */
const PEARL_AHEAD = 36;

/** A dragon's colours: its body, its belly scales, and the gold of its mane, fins and whiskers. */
export interface DragonPalette {
  body: string;
  belly: string;
  trim: string;
}

export const DRAGON_PALETTES: readonly DragonPalette[] = [
  // Red and gold, for luck.
  { body: '#DC2626', belly: '#FDE68A', trim: '#F59E0B' },
  // Gold, with red trim.
  { body: '#F59E0B', belly: '#FEF3C7', trim: '#DC2626' },
  // Jade.
  { body: '#059669', belly: '#D1FAE5', trim: '#FBBF24' },
  // Azure, with silver.
  { body: '#2563EB', belly: '#DBEAFE', trim: '#E2E8F0' },
  // Violet and gold.
  { body: '#7C3AED', belly: '#EDE9FE', trim: '#FBBF24' },
];

interface Options {
  /** The colours to pick from for each crossing; the first until the first pick. */
  palettes?: readonly DragonPalette[];
}

/** The wave's height at x, and its slope there. */
const wave = (x: number) => WAVE * Math.sin((x / WAVELENGTH) * Math.PI * 2);
const slope = (x: number) =>
  ((WAVE * Math.PI * 2) / WAVELENGTH) * Math.cos((x / WAVELENGTH) * Math.PI * 2);

/**
 * A Chinese dragon (舞龙) snakes across above the pile chasing a flaming pearl, its body
 * following its head's path, and swallows the icons it passes; the duds it spits back out.
 */
export class Dragon implements Craft, Remover {
  readonly name = 'dragon';
  readonly crossMs = 4800;
  /** Icons go into its jaws, ahead of and below its head's middle. */
  readonly tie = { dx: 17, dy: 4 };
  readonly intake = new Mouth();
  /** Its body and tail. */
  readonly trail = SEGMENTS * SPACING + 20;
  private readonly palettes: readonly DragonPalette[];
  private palette: DragonPalette;

  constructor({ palettes = DRAGON_PALETTES }: Options = {}) {
    this.palettes = palettes;
    this.palette = palettes[0]!;
  }

  /** Picks this crossing's colours, then sets off. */
  begin(board: Board, now: number, rng: () => number): Removal {
    this.palette = pick(this.palettes, rng);
    return new Crossing(this, board, now, rng);
  }

  minY(): number {
    return 40;
  }

  /** It dips this far below its course on the wave. */
  sag(): number {
    return WAVE;
  }

  pathAt(course: Course, px: number): Pose {
    return { py: course.altitude + wave(px), tilt: Math.atan(slope(px)) };
  }

  /** The pearl, the body from the tail up, then the head at (x, y). */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, t: number): void {
    const { palette } = this;
    // Where the course is, from the head: the body follows the same wave behind it.
    const base = y - wave(x);
    this.drawPearl(ctx, x + PEARL_AHEAD, base + wave(x + PEARL_AHEAD) - 6, t);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // The tail fin first, then each segment from the tail forward.
    const tailX = x - (SEGMENTS + 1) * SPACING;
    this.drawTail(ctx, tailX, base + wave(tailX), Math.atan(slope(tailX)), t);
    for (let k = SEGMENTS; k >= 1; k--) {
      const sx = x - k * SPACING;
      const sy = base + wave(sx);
      const r = THICK + ((THIN - THICK) * (k - 1)) / (SEGMENTS - 1);
      const a = Math.atan(slope(sx));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a);
      // Legs, on two segments, paddling.
      if (k === 3 || k === 8) {
        const paddle = Math.sin(t / 140 + k) * 0.5;
        ctx.strokeStyle = palette.trim;
        ctx.lineWidth = 2;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * 2, r * 0.6);
          ctx.lineTo(side * 4 + Math.sin(paddle) * 5, r + 6);
          ctx.lineTo(side * 7 + Math.sin(paddle) * 5, r + 7);
          ctx.stroke();
        }
      }
      // A fin along the spine.
      ctx.fillStyle = palette.trim;
      ctx.beginPath();
      ctx.moveTo(4, -r * 0.8);
      ctx.lineTo(-5, -r - 5);
      ctx.lineTo(-3, -r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.body;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.belly;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.45, r * 0.8, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.drawHead(ctx, x, y, tilt, t);
    ctx.restore();
  }

  /** The head facing right at (x, y), its jaws chomping. */
  private drawHead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tilt: number,
    t: number,
  ): void {
    const { palette } = this;
    const jaw = 0.15 + 0.3 * Math.abs(Math.sin(t / 110));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // Mane flames behind the head.
    ctx.fillStyle = palette.trim;
    for (const [mx, my, len] of [
      [-8, -6, 14],
      [-10, 0, 12],
      [-7, 6, 10],
    ] as const) {
      const flick = Math.sin(t / 90 + my) * 2;
      ctx.beginPath();
      ctx.moveTo(mx + 4, my - 3);
      ctx.lineTo(mx - len, my + flick);
      ctx.lineTo(mx + 4, my + 3);
      ctx.closePath();
      ctx.fill();
    }
    // Horns, sweeping back.
    ctx.strokeStyle = palette.trim;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-1, -9);
    ctx.quadraticCurveTo(-8, -18, -18, -19);
    ctx.moveTo(3, -9);
    ctx.quadraticCurveTo(-2, -20, -10, -24);
    ctx.stroke();
    // Lower jaw, opening and closing.
    ctx.fillStyle = palette.body;
    ctx.save();
    ctx.translate(4, 3);
    ctx.rotate(jaw);
    ctx.beginPath();
    ctx.roundRect(0, -2, 17, 5, 2.5);
    ctx.fill();
    ctx.restore();
    // Head and upper jaw.
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(4, -6, 18, 8, 4);
    ctx.fill();
    // Nostril, eye and brow.
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(19, -3, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.ellipse(3, -4, 3.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(4, -4, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.trim;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-1, -8);
    ctx.lineTo(7, -7);
    ctx.stroke();
    // Whiskers, trailing back from the snout and waving.
    ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      const sway = Math.sin(t / 160 + side) * 4;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.quadraticCurveTo(8, 8 * side + 6, -14, 6 * side + 8 + sway);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The tail's fan of a fin, at (x, y). */
  private drawTail(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    a: number,
    t: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.sin(t / 200) * 0.2);
    ctx.fillStyle = this.palette.trim;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-12, -9);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** The flaming pearl, flickering. */
  private drawPearl(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const flicker = 1 + Math.sin(t / 70) * 0.12;
    ctx.save();
    const fire = ctx.createRadialGradient(x, y, 2, x, y, 13 * flicker);
    fire.addColorStop(0, 'rgba(253, 224, 71, 0.95)');
    fire.addColorStop(0.5, 'rgba(249, 115, 22, 0.55)');
    fire.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.arc(x, y, 13 * flicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFBEB';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
