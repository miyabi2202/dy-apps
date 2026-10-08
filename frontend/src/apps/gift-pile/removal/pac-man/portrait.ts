import type { SpriteSource } from '../board';

// Pac-Man's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;
const MID = SIZE / 2;

/** Pac-Man, a glossy sphere with his mouth open to the right, his eye, and neon pellets ahead. */
export function pacManPortrait(color: string): SpriteSource {
  return {
    key: `portrait/pac-man/${color}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      const mouth = 0.62;
      const cx = MID - 6;
      const r = 23;
      // The neon tubes of his lane, above and below.
      ctx.shadowColor = '#3b82f6';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (const y of [MID - 29, MID + 29]) {
        ctx.beginPath();
        ctx.moveTo(6, y);
        ctx.lineTo(58, y);
        ctx.stroke();
      }
      // The pellets ahead, shining.
      ctx.shadowColor = '#fde68a';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#fffbeb';
      for (const x of [MID + 24, MID + 31]) {
        ctx.beginPath();
        ctx.arc(x, MID, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // The sphere, lit from the upper left, with a neon glow.
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      const body = ctx.createRadialGradient(cx - 8, MID - 9, 2, cx - 2, MID - 2, r + 4);
      body.addColorStop(0, '#fffbe6');
      body.addColorStop(0.28, color);
      body.addColorStop(0.75, '#d97706');
      body.addColorStop(1, '#78350f');
      ctx.fillStyle = body;
      ctx.strokeStyle = '#fef9c3';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, MID);
      ctx.arc(cx, MID, r, mouth, Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      // The dark hollow of his mouth.
      const hollow = ctx.createRadialGradient(cx, MID, 1, cx, MID, r);
      hollow.addColorStop(0, '#1c0a00');
      hollow.addColorStop(1, '#9a4a08');
      ctx.fillStyle = hollow;
      ctx.beginPath();
      ctx.moveTo(cx, MID);
      ctx.arc(cx, MID, r - 0.8, -mouth, mouth);
      ctx.closePath();
      ctx.fill();
      // The shine, and his glossy eye with its glint.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.ellipse(cx - 9, MID - 11, 4.5, 3.5, -0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.beginPath();
      ctx.ellipse(cx + 3, MID - 12, 3, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx + 2, MID - 13.5, 1, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}
