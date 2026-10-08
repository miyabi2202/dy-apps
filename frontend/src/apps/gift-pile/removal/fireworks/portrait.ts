import type { SpriteSource } from '../board';

// The fireworks' picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;
const MID = SIZE / 2;

/** A firework bursting: rays out from a bright middle. */
export function fireworksPortrait(color: string): SpriteSource {
  return {
    key: `portrait/fireworks/${color}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      // The burst's glow, then its stars: a streak each, thick at the bright head.
      const halo = ctx.createRadialGradient(MID, MID, 0, MID, MID, 30);
      halo.addColorStop(0, '#ffffff');
      halo.addColorStop(0.25, color);
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2 + 0.1;
        const long = i % 2 === 0;
        const far = long ? 29 : 21;
        const near = long ? 9 : 12;
        const x0 = MID + Math.cos(a) * near;
        const y0 = MID + Math.sin(a) * near;
        const x1 = MID + Math.cos(a) * far;
        const y1 = MID + Math.sin(a) * far;
        const streak = ctx.createLinearGradient(x0, y0, x1, y1);
        streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
        streak.addColorStop(0.7, color);
        streak.addColorStop(1, '#ffffff');
        ctx.strokeStyle = streak;
        ctx.lineWidth = long ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x1, y1, long ? 2.4 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // A white-hot core.
      ctx.shadowBlur = 14;
      const core = ctx.createRadialGradient(MID, MID, 0, MID, MID, 11);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.5, '#fff7d6');
      core.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(MID, MID, 11, 0, Math.PI * 2);
      ctx.fill();
      // Glitter: little four-point stars.
      ctx.shadowBlur = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      for (const [x, y, r] of [
        [10, 14, 4],
        [54, 50, 3.5],
        [52, 10, 3],
        [12, 52, 3],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x - r, y);
        ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y + r);
        ctx.stroke();
      }
    },
  };
}
