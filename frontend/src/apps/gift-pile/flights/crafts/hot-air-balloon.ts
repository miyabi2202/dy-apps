import type { Course, Craft, Pose } from './craft';
import { climbAway } from './flyover';

/** The envelope's radius, the skirt below it, the lines down to the basket, and the basket. */
const R = 30;
const SKIRT = 12;
const LINES = 14;
const BASKET_W = 20;
const BASKET_H = 12;
const STRIPES = 8;

/** A hot-air balloon: drifts over slowly with a lazy bob, then rises away without tilting. */
export class HotAirBalloon implements Craft {
  readonly name = 'balloon';
  readonly crossMs = 5600;
  /** The rope ties on under the basket. */
  readonly tie = { dx: 0, dy: R + SKIRT + LINES + BASKET_H };

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
    // The skirt first, so the envelope covers its top.
    const throatY = y + r + SKIRT;
    ctx.fillStyle = '#b91c1c';
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
      ctx.fillStyle = i % 2 === 0 ? '#f87171' : '#fde68a';
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
    ctx.strokeStyle = '#7f1d1d';
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
