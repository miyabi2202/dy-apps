import type { SpriteSource } from '../board';
import { paintHead } from './rider';
import type { DeliveryScheme } from './scooter';

// The rider's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;

/** The rider in his helmet, shouting, a thumb up, with a teetering stack of parcels over his shoulder. */
export function riderPortrait(scheme: DeliveryScheme): SpriteSource {
  return {
    key: `portrait/delivery/${scheme.main}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // The stack behind him, leaning: a column of little parcels on his box.
      ctx.fillStyle = scheme.deep;
      ctx.fillRect(2, 40, 20, 24);
      const parcels = ['#f6a55b', '#e9d4a8', '#f6a55b', '#c98d5a', '#e9d4a8'];
      parcels.forEach((color, k) => {
        ctx.save();
        ctx.translate(12 + k * k * 0.5, 36 - k * 8.5);
        ctx.rotate(0.06 * k + (k % 2 ? 0.12 : -0.1));
        ctx.fillStyle = color;
        ctx.fillRect(-7, -4, 14, 8);
        ctx.strokeStyle = 'rgba(80, 50, 20, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-7, -4, 14, 8);
        ctx.restore();
      });
      // His shoulders, in his jacket with its stripe.
      ctx.fillStyle = scheme.main;
      ctx.beginPath();
      ctx.ellipse(32, 68, 24, 17, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#e4e8ee';
      ctx.fillRect(10, 59, 44, 3.4);
      // His head, and the mouth wide open in a shout.
      paintHead(ctx, 26, 32, 2.6, scheme);
      ctx.fillStyle = '#5a1e1e';
      ctx.beginPath();
      ctx.ellipse(45, 46.5, 3.6, 4.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e86b6b';
      ctx.beginPath();
      ctx.ellipse(45, 48.6, 2.4, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
      // A thumb up.
      ctx.fillStyle = '#f1c7a1';
      ctx.strokeStyle = '#b07a55';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(51, 53, 11, 9, 3);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(52.5, 45, 4.4, 10, 2.2);
      ctx.fill();
      ctx.stroke();
    },
  };
}
