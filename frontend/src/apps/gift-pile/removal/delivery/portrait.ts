import type { SpriteSource } from '../board';
import { paintHead } from './rider';
import type { DeliveryScheme } from './scooter';

// The rider's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;

/** The rider in his helmet, shouting, a thumb up, with his overstuffed box tied shut over his shoulder. */
export function riderPortrait(scheme: DeliveryScheme): SpriteSource {
  return {
    key: `portrait/delivery/${scheme.main}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // The box behind him, a few parcels peeking out under its lid, roped down.
      ctx.fillStyle = scheme.main;
      ctx.fillRect(1, 26, 24, 38);
      for (const [x, color] of [
        [6, '#f6a55b'],
        [13, '#e9d4a8'],
        [19, '#c98d5a'],
      ] as const) {
        ctx.fillStyle = color;
        ctx.fillRect(x - 4, 19, 8, 8);
      }
      ctx.save();
      ctx.translate(0, 24);
      ctx.rotate(-0.12);
      ctx.fillStyle = scheme.deep;
      ctx.fillRect(0, -4, 27, 5);
      ctx.restore();
      ctx.strokeStyle = '#d2a35c';
      ctx.lineWidth = 2;
      for (const x of [7, 18]) {
        ctx.beginPath();
        ctx.moveTo(x, 22 - x * 0.12);
        ctx.lineTo(x, 64);
        ctx.stroke();
      }
      ctx.fillStyle = '#d2a35c';
      ctx.beginPath();
      ctx.arc(7, 23, 2.6, 0, Math.PI * 2);
      ctx.fill();
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
