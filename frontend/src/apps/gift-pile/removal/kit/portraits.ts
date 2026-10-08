import type { SpriteSource } from '../board';

// Small pictures of the removers, for the cut-in banner. Each is painted once, 64 × 64, with
// Canvas2D, in a colour the remover picks.

const SIZE = 64;
const MID = SIZE / 2;

/** Pac-Man, mouth open to the right, with his eye. */
export function pacManPortrait(color: string): SpriteSource {
  return {
    key: `portrait/pac-man/${color}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      const mouth = 0.62;
      // A neon glow, and a lit body.
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      const body = ctx.createRadialGradient(MID - 8, MID - 10, 2, MID, MID, 28);
      body.addColorStop(0, '#fffbe6');
      body.addColorStop(0.35, color);
      body.addColorStop(1, '#ca8a04');
      ctx.fillStyle = body;
      ctx.strokeStyle = '#fef9c3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(MID, MID);
      ctx.arc(MID, MID, 27, mouth, Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(MID + 3, MID - 15, 3.6, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

/** A black hole seen at a slant: a dark horizon in a glowing disk. */
export function blackHolePortrait(glow: string, disk: string): SpriteSource {
  return {
    key: `portrait/black-hole/${glow}/${disk}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      const halo = ctx.createRadialGradient(MID, MID, 6, MID, MID, 31);
      halo.addColorStop(0, glow);
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.shadowColor = disk;
      ctx.shadowBlur = 10;
      for (const [rx, ry, w, a] of [
        [29, 9, 4, 1],
        [23, 7, 2, 0.7],
      ] as const) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = disk;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.ellipse(MID, MID, rx, ry, -0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(MID, MID, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
  };
}

/** A claw hanging by its cable, three prongs open. */
export function clawPortrait(body: string, metal: string): SpriteSource {
  return {
    key: `portrait/claw/${body}/${metal}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(MID, 0);
      ctx.lineTo(MID, 20);
      ctx.stroke();
      ctx.strokeStyle = metal;
      ctx.shadowColor = body;
      ctx.shadowBlur = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      for (const side of [-1, 0, 1]) {
        ctx.beginPath();
        ctx.moveTo(MID, 24);
        ctx.lineTo(MID + side * 17, 42);
        ctx.lineTo(MID + side * 10, 56);
        ctx.stroke();
      }
      ctx.fillStyle = body;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(MID, 22, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
  };
}

/** A firework bursting: rays out from a bright middle. */
export function fireworksPortrait(color: string): SpriteSource {
  return {
    key: `portrait/fireworks/${color}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const near = i % 2 === 0 ? 10 : 14;
        const far = i % 2 === 0 ? 29 : 22;
        ctx.lineWidth = i % 2 === 0 ? 4 : 2.5;
        ctx.beginPath();
        ctx.moveTo(MID + Math.cos(a) * near, MID + Math.sin(a) * near);
        ctx.lineTo(MID + Math.cos(a) * far, MID + Math.sin(a) * far);
        ctx.stroke();
      }
      const core = ctx.createRadialGradient(MID, MID, 0, MID, MID, 12);
      core.addColorStop(0, '#fff');
      core.addColorStop(1, color);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(MID, MID, 9, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}
