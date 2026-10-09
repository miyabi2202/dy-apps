import type { SpriteSource } from '../board';
import { type CatPalette, paintFace } from './body';
import { paintBuddy } from './buddy';
import { NEON_CYAN, NEON_MAGENTA } from './neon';

// The cat's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;

/**
 * The cat staring straight out of the banner, deadpan, in its harness, the neon catching its
 * edges, and its drone buddy peeking out of the backpack over its shoulder with a '?' on its
 * screen.
 */
export function catPortrait(palette: CatPalette): SpriteSource {
  return {
    key: `portrait/cat/${palette.key}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // The buddy's glow, then the buddy down in the backpack behind its right shoulder.
      const glow = ctx.createRadialGradient(48.5, 28, 0, 48.5, 28, 16);
      glow.addColorStop(0, 'rgba(63, 240, 255, 0.45)');
      glow.addColorStop(1, 'rgba(63, 240, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(30, 8, 34, 40);
      ctx.save();
      ctx.translate(48.5, 30);
      ctx.rotate(0.12);
      ctx.scale(1.2, 1.2);
      paintBuddy(ctx, 'what');
      ctx.restore();
      ctx.fillStyle = '#30333b';
      ctx.strokeStyle = '#121318';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(35, 37.5, 31, 28, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(58, 50, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff5fb8';
      ctx.beginPath();
      ctx.arc(52, 53, 1.9, 0, Math.PI * 2);
      ctx.fill();
      // Its shoulders and cream chest, below its chin, the neon on each side.
      const shoulders = () => {
        ctx.beginPath();
        ctx.ellipse(26, 70, 21, 18, 0, Math.PI, 0);
        ctx.closePath();
      };
      ctx.fillStyle = NEON_CYAN;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.ellipse(24.4, 69, 21.5, 18.6, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = NEON_MAGENTA;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(27.6, 69.6, 21.5, 18.4, 0, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.fur;
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 1.6;
      shoulders();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.light;
      ctx.beginPath();
      ctx.ellipse(26, 66, 9, 12, 0, Math.PI, 0);
      ctx.fill();
      // The harness strap over its shoulder.
      ctx.strokeStyle = '#24262d';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(41, 55);
      ctx.quadraticCurveTo(33, 60, 31, 66);
      ctx.stroke();
      // Its head, staring straight at you.
      ctx.save();
      ctx.translate(24, 37);
      ctx.scale(1.62, 1.62);
      paintFace(ctx, palette, 'front');
      ctx.restore();
    },
  };
}
