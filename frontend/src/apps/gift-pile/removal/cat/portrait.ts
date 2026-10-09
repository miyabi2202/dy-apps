import type { SpriteSource } from '../board';
import { type CatPalette, paintFace } from './body';

// The cat's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;

/** The cat staring straight out of the banner, deadpan and rosy-cheeked, one round paw resting on a gift it is about to push off. */
export function catPortrait(palette: CatPalette): SpriteSource {
  return {
    key: `portrait/cat/${palette.key}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Its round little body, below its chin, with its pale tummy.
      ctx.fillStyle = palette.fur;
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(27, 66, 20, 20, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.light;
      ctx.beginPath();
      ctx.ellipse(27, 64, 10, 12, 0, Math.PI, 0);
      ctx.fill();
      // The gift at the edge, tipping, a ribbon round it.
      ctx.save();
      ctx.translate(53, 54);
      ctx.rotate(0.25);
      ctx.fillStyle = '#ff6f8e';
      ctx.strokeStyle = '#a82a50';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-8, -8, 16, 16, 2.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffe07a';
      ctx.fillRect(-1.8, -8, 3.6, 16);
      ctx.fillRect(-8, -1.8, 16, 3.6);
      ctx.restore();
      // Its head, staring straight at you.
      ctx.save();
      ctx.translate(28, 34);
      ctx.scale(1.42, 1.42);
      paintFace(ctx, palette, 'front');
      ctx.restore();
      // The round paw on the gift, its toe beans showing.
      ctx.fillStyle = palette.fur;
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(46, 52, 6.5, 5.2, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.ear;
      ctx.beginPath();
      ctx.ellipse(46.4, 53.2, 2.2, 1.8, -0.3, 0, Math.PI * 2);
      ctx.fill();
      for (const [x, y] of [
        [42.6, 51],
        [45, 49.2],
        [47.8, 48.6],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}
