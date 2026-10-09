import type { SpriteSource } from '../board';
import { GOLD, paintHead, SCARLET } from './rider';

// The wizard's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;

/** The wizard in his scarf, his wand raised with the spell's light at its tip. */
export function wizardPortrait(light: string): SpriteSource {
  return {
    key: `portrait/evanesco/${light}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.lineCap = 'round';
      // His shoulders, in his robe, and the scarf round his neck with a tail hanging down.
      ctx.fillStyle = '#15121b';
      ctx.beginPath();
      ctx.ellipse(28, 66, 24, 18, 0, Math.PI, 0);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.rect(15, 44, 26, 9);
      ctx.rect(29, 48, 8, 18);
      ctx.fillStyle = SCARLET;
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.6;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.moveTo(10 + k * 6, 42);
        ctx.lineTo(18 + k * 6, 68);
        ctx.stroke();
      }
      ctx.restore();
      // His head.
      paintHead(ctx, 26, 29, 2.05);
      // The wand, raised, and the spell's light at its tip.
      ctx.strokeStyle = '#5b3a23';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(44, 58);
      ctx.lineTo(56, 18);
      ctx.stroke();
      ctx.fillStyle = '#f2c9a7';
      ctx.beginPath();
      ctx.arc(44, 58, 4.5, 0, Math.PI * 2);
      ctx.fill();
      const spark = ctx.createRadialGradient(56, 17, 0, 56, 17, 12);
      spark.addColorStop(0, '#ffffff');
      spark.addColorStop(0.3, light);
      spark.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spark;
      ctx.beginPath();
      ctx.arc(56, 17, 12, 0, Math.PI * 2);
      ctx.fill();
      // A four-pointed glint over it.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(56, 7);
      ctx.lineTo(57.2, 15.8);
      ctx.lineTo(66, 17);
      ctx.lineTo(57.2, 18.2);
      ctx.lineTo(56, 27);
      ctx.lineTo(54.8, 18.2);
      ctx.lineTo(46, 17);
      ctx.lineTo(54.8, 15.8);
      ctx.closePath();
      ctx.fill();
    },
  };
}
