import type { SpriteSource } from '../board';

// The helicopter's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;
const MID = SIZE / 2;

/** A rescue helicopter side on, facing right: glossy paint with a stripe, tinted glass, its rotor a blur. */
export function helicopterPortrait(body: string, stripe: string): SpriteSource {
  return {
    key: `portrait/helicopter/${body}/${stripe}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      // The rotor, a soft disc with a blade caught in it, over the mast.
      ctx.fillStyle = '#334155';
      ctx.fillRect(31, 17, 3, 8);
      const disc = ctx.createLinearGradient(4, 0, 60, 0);
      disc.addColorStop(0, 'rgba(226, 232, 240, 0)');
      disc.addColorStop(0.5, 'rgba(226, 232, 240, 0.7)');
      disc.addColorStop(1, 'rgba(226, 232, 240, 0)');
      ctx.shadowColor = '#bae6fd';
      ctx.shadowBlur = 8;
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.ellipse(MID + 1, 16, 29, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(MID + 12, 16, 13, 1, 0.05, 0, Math.PI * 2);
      ctx.fill();
      // The skids.
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(17, 53);
      ctx.lineTo(48, 53);
      ctx.lineTo(52, 49);
      ctx.moveTo(25, 46);
      ctx.lineTo(24, 53);
      ctx.moveTo(40, 46);
      ctx.lineTo(41, 53);
      ctx.stroke();
      // The tail boom and fin.
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(28, 30);
      ctx.lineTo(11, 23);
      ctx.lineTo(7, 15);
      ctx.lineTo(11, 14);
      ctx.lineTo(14, 21);
      ctx.lineTo(14, 27);
      ctx.lineTo(28, 41);
      ctx.closePath();
      ctx.fill();
      // The fuselage, lit from above, with a stripe along it.
      const paint = ctx.createLinearGradient(0, 24, 0, 49);
      paint.addColorStop(0, '#ffffff');
      paint.addColorStop(0.25, body);
      paint.addColorStop(0.75, body);
      paint.addColorStop(1, '#1e293b');
      ctx.shadowColor = body;
      ctx.shadowBlur = 8;
      ctx.fillStyle = paint;
      ctx.beginPath();
      ctx.ellipse(MID + 4, 37, 23, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.clip();
      ctx.fillStyle = stripe;
      ctx.beginPath();
      ctx.moveTo(6, 44);
      ctx.lineTo(60, 38);
      ctx.lineTo(60, 43);
      ctx.lineTo(6, 49);
      ctx.fill();
      ctx.restore();
      // The cockpit glass, with a streak of sky on it.
      const glass = ctx.createLinearGradient(0, 27, 0, 41);
      glass.addColorStop(0, '#7dd3fc');
      glass.addColorStop(1, '#0c1a33');
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.ellipse(46, 35, 10, 7, 0, Math.PI, 0);
      ctx.lineTo(55, 38);
      ctx.lineTo(37, 38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(41, 29);
      ctx.lineTo(45, 29);
      ctx.lineTo(41, 37);
      ctx.lineTo(38, 37);
      ctx.fill();
      // The lights.
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(6, 18, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(MID + 1, 14, 1.6, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}
