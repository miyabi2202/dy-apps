import type { SpriteSource } from '../board';
import { paintHead } from './pusher';
import type { Livery } from './train';

// The platform pusher's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;

/** The pusher in his cap, gritting his teeth, a white glove thrust forward, before a car in `livery`. */
export function pusherPortrait(livery: Livery): SpriteSource {
  return {
    key: `portrait/subway/${livery.line}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // The side of a car behind him: steel, a window and the line's band.
      ctx.fillStyle = '#c9ced6';
      ctx.fillRect(0, 6, SIZE, 50);
      ctx.fillStyle = '#fbefc9';
      ctx.fillRect(34, 12, 30, 20);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(44, 12);
      ctx.lineTo(50, 12);
      ctx.lineTo(42, 32);
      ctx.lineTo(36, 32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = livery.line;
      ctx.fillRect(0, 38, SIZE, 6);
      ctx.fillStyle = livery.accent;
      ctx.fillRect(0, 45, SIZE, 2);
      // His shoulders in the uniform, the collar and tie.
      ctx.fillStyle = '#1d2b4f';
      ctx.beginPath();
      ctx.ellipse(24, 68, 22, 16, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(18, 52);
      ctx.lineTo(30, 52);
      ctx.lineTo(24, 60);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#c62828';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(24, 55);
      ctx.lineTo(24, 64);
      ctx.stroke();
      paintHead(ctx, 22, 34, 2.4, false);
      // A bead of sweat at his temple.
      ctx.fillStyle = '#8fd3ff';
      ctx.beginPath();
      ctx.moveTo(10, 22);
      ctx.quadraticCurveTo(13, 27, 10, 29);
      ctx.quadraticCurveTo(7, 27, 10, 22);
      ctx.fill();
      // The white glove, thrust forward, with lines of effort round it.
      ctx.strokeStyle = '#1d2b4f';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(34, 64);
      ctx.lineTo(48, 50);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#8f98ab';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(52, 46, 7, 8, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(51, 40);
      ctx.lineTo(55, 50);
      ctx.moveTo(54, 39);
      ctx.lineTo(57.5, 48);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      for (const [x0, y0, x1, y1] of [
        [58, 34, 62, 30],
        [61, 44, 64, 43],
        [58, 56, 62, 59],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    },
  };
}
