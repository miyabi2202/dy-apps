import type { SpriteSource } from '../board';

// The claw's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;
const MID = SIZE / 2;

/** A claw hanging by its cable, three prongs open. */
export function clawPortrait(body: string, metal: string): SpriteSource {
  return {
    key: `portrait/claw/${body}/${metal}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      // The gantry across the top, its LEDs lit.
      ctx.shadowColor = body;
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 2, SIZE, 5);
      ctx.shadowBlur = 5;
      ctx.fillStyle = body;
      for (let x = 4; x < SIZE; x += 8) {
        ctx.beginPath();
        ctx.arc(x, 4.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // The chain, in bright links.
      ctx.shadowBlur = 0;
      const chain = ctx.createLinearGradient(MID - 2, 0, MID + 2, 0);
      chain.addColorStop(0, '#64748b');
      chain.addColorStop(0.45, '#ffffff');
      chain.addColorStop(1, '#475569');
      ctx.fillStyle = chain;
      for (let y = 7; y < 17; y += 3.6) ctx.fillRect(MID - 1.6, y, 3.2, 2.4);
      // The prongs: chrome with a bright edge, glowing with the body's colour.
      ctx.shadowColor = body;
      ctx.shadowBlur = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const side of [0, -1, 1]) {
        const kneeX = MID + side * 17;
        const tipX = MID + side * 9;
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(MID, 25);
          ctx.lineTo(kneeX, 42);
          ctx.lineTo(tipX, 57);
        };
        const grad = ctx.createLinearGradient(MID - 18, 0, MID + 18, 0);
        grad.addColorStop(0, metal);
        grad.addColorStop(0.5, '#ffffff');
        grad.addColorStop(1, '#64748b');
        ctx.strokeStyle = side === 0 ? '#64748b' : grad;
        ctx.lineWidth = side === 0 ? 4 : 5.5;
        path();
        ctx.stroke();
        if (side !== 0) {
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 1.4;
          path();
          ctx.stroke();
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(kneeX, 42, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // The hub: a lacquered body, a chrome bezel and a glowing core.
      ctx.shadowBlur = 0;
      const lacquer = ctx.createLinearGradient(0, 15, 0, 31);
      lacquer.addColorStop(0, '#ffffff');
      lacquer.addColorStop(0.25, body);
      lacquer.addColorStop(1, '#0f172a');
      ctx.fillStyle = lacquer;
      ctx.strokeStyle = metal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(MID - 15, 16, 30, 15, 6);
      ctx.fill();
      ctx.stroke();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      const core = ctx.createRadialGradient(MID, 23.5, 0, MID, 23.5, 6);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.5, body);
      core.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(MID, 23.5, 6, 0, Math.PI * 2);
      ctx.fill();
      // A spark where the prongs meet.
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(MID - 5, 58);
      ctx.lineTo(MID - 1, 54);
      ctx.lineTo(MID + 1, 59);
      ctx.lineTo(MID + 6, 55);
      ctx.stroke();
    },
  };
}
