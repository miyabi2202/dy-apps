import type { SpriteSource } from '../board';
import { type CatPalette, paintFace } from './body';

// The cat's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;

/** The cat staring straight out of the banner, deadpan, one paw resting on a gift it is about to push off. */
export function catPortrait(palette: CatPalette): SpriteSource {
  return {
    key: `portrait/cat/${palette.key}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Its chest, below its chin.
      ctx.fillStyle = palette.fur;
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(28, 70, 22, 22, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.light;
      ctx.beginPath();
      ctx.ellipse(28, 66, 10, 14, 0, Math.PI, 0);
      ctx.fill();
      // The gift at the edge, tipping, a ribbon round it.
      ctx.save();
      ctx.translate(53, 53);
      ctx.rotate(0.25);
      ctx.fillStyle = '#e4405f';
      ctx.strokeStyle = '#7d1430';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeRect(-8, -8, 16, 16);
      ctx.fillStyle = '#ffd56b';
      ctx.fillRect(-1.8, -8, 3.6, 16);
      ctx.fillRect(-8, -1.8, 16, 3.6);
      ctx.restore();
      // Its head, staring straight at you.
      ctx.save();
      ctx.translate(28, 30);
      ctx.scale(1.75, 1.75);
      paintFace(ctx, palette, 'front');
      ctx.restore();
      // The paw on the gift.
      ctx.fillStyle = palette.fur;
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(45, 52, 6.5, 4.6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(43, 50);
      ctx.lineTo(44, 54);
      ctx.moveTo(46.5, 49.5);
      ctx.lineTo(47.5, 53.5);
      ctx.stroke();
    },
  };
}
