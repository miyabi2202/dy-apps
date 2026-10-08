import type { SpriteSource } from '../board';

// The supercar's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;
const MID = SIZE / 2;

/** A supercar in profile, its paint glossy under a sweep of light, on a pool of neon. */
export function carPortrait(body: string, neon: string, trim: string): SpriteSource {
  return {
    key: `portrait/car/${body}/${neon}/${trim}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      // The same outline as the car drawn in GLSL, a little under one to one.
      const k = 0.9;
      ctx.translate(MID, 36);
      ctx.scale(k, k);
      const path = (points: number[][]) => {
        ctx.beginPath();
        points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x!, y!) : ctx.lineTo(x!, y!)));
        ctx.closePath();
      };
      // The neon on the road beneath.
      ctx.save();
      ctx.scale(1, 0.14);
      const pool = ctx.createRadialGradient(0, 12 / 0.14, 0, 0, 12 / 0.14, 40);
      pool.addColorStop(0, neon);
      pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = pool;
      ctx.fillRect(-44, 4 / 0.14, 88, 16 / 0.14);
      ctx.restore();
      // The wing.
      ctx.fillStyle = trim;
      ctx.fillRect(-35, -11.5, 11, 2);
      ctx.fillRect(-31.5, -9.5, 1.6, 4);
      // The body, lit from above and dark beneath.
      const paint = ctx.createLinearGradient(0, -12, 0, 7);
      paint.addColorStop(0, '#ffffff');
      paint.addColorStop(0.18, body);
      paint.addColorStop(0.62, body);
      paint.addColorStop(1, '#0f172a');
      ctx.shadowColor = neon;
      ctx.shadowBlur = 10;
      ctx.fillStyle = paint;
      path([
        [33, 3.6],
        [33.4, 0.8],
        [31.8, -1.3],
        [28, -2.6],
        [22, -3.9],
        [16.5, -5.2],
        [12, -7.6],
        [6.5, -10.2],
        [1, -11.7],
        [-5, -11.7],
        [-11, -10.3],
        [-16.5, -8.4],
        [-22, -6.8],
        [-27, -6],
        [-31.5, -5.6],
        [-33.6, -3.8],
        [-33.8, 0.6],
        [-32.2, 4.8],
        [-28, 6.6],
        [28, 6.6],
        [31.6, 5.6],
      ]);
      ctx.fill();
      ctx.shadowBlur = 0;
      // The wheels in their arches.
      for (const wx of [-21.5, 21.5]) {
        ctx.fillStyle = '#05060a';
        ctx.beginPath();
        ctx.arc(wx, 5.5, 7.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0b0d14';
        ctx.beginPath();
        ctx.arc(wx, 5.5, 6.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = neon;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(wx, 5.5, 5.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(wx, 5.5, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#475569';
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5;
          ctx.beginPath();
          ctx.arc(wx + Math.cos(a) * 2.3, 5.5 + Math.sin(a) * 2.3, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // The glass, with a streak of reflection.
      const glass = ctx.createLinearGradient(0, -12, 0, -4);
      glass.addColorStop(0, '#7dd3fc');
      glass.addColorStop(0.4, '#0f172a');
      glass.addColorStop(1, '#020617');
      ctx.fillStyle = glass;
      path([
        [15, -5],
        [11.2, -7.2],
        [6.2, -9.5],
        [1.2, -10.7],
        [-4.8, -10.7],
        [-10.4, -9.4],
        [-15.6, -7.6],
        [-19.8, -6.2],
        [-19.6, -5.2],
        [14.6, -4.3],
      ]);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      path([
        [8, -9],
        [10, -7.6],
        [3, -10.4],
        [-0.4, -11.2],
      ]);
      ctx.fill();
      // The shoulder's line of light and the neon down the sill.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-26, -4);
      ctx.lineTo(24, -0.6);
      ctx.stroke();
      ctx.shadowColor = neon;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = neon;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-14, 4.7);
      ctx.lineTo(14, 4.7);
      ctx.stroke();
      // The lamps, with their bloom.
      ctx.shadowColor = '#e0f2fe';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#f0f9ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(25.2, -2.6);
      ctx.lineTo(31, -1.3);
      ctx.stroke();
      ctx.shadowColor = '#ef4444';
      ctx.strokeStyle = '#ff5a4a';
      ctx.beginPath();
      ctx.moveTo(-30.6, -3.6);
      ctx.lineTo(-33.5, -0.9);
      ctx.stroke();
    },
  };
}
