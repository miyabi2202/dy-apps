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

/** A black hole after Gargantua: a black disc with a thin bright ring, its accretion disk bent over and under it. */
export function blackHolePortrait(glow: string, disk: string): SpriteSource {
  return {
    key: `portrait/black-hole/${glow}/${disk}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      const halo = ctx.createRadialGradient(MID, MID, 8, MID, MID, 31);
      halo.addColorStop(0, glow);
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalAlpha = 1;
      ctx.translate(MID, MID);
      ctx.rotate(-0.1);
      // The disk: white-hot on the side coming towards us, dimmer on the other.
      const lit = ctx.createLinearGradient(-30, 0, 30, 0);
      lit.addColorStop(0, '#ffffff');
      lit.addColorStop(0.35, disk);
      lit.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      ctx.shadowColor = disk;
      ctx.shadowBlur = 9;
      ctx.strokeStyle = lit;
      ctx.lineCap = 'round';
      // Its far side, bent over the top and under the bottom of the hole.
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(0, 0, 14.5, Math.PI * 1.04, Math.PI * 1.96);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, 14.5, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      // The horizon, with the photon ring round it.
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // The near side of the disk, flat across the front.
      ctx.shadowColor = disk;
      ctx.shadowBlur = 4;
      ctx.strokeStyle = lit;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 29, 5, 0, 0.12, Math.PI - 0.12);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 29, 5, 0, Math.PI + 0.3, Math.PI * 2 - 0.3);
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

/** A flying saucer: a silver hull with its lights on, under a glowing dome. */
export function ufoPortrait(hull: string, dome: string, lights: string): SpriteSource {
  return {
    key: `portrait/ufo/${hull}/${dome}/${lights}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      const cy = 38;
      // The dome, a glass bubble full of light.
      ctx.shadowColor = dome;
      ctx.shadowBlur = 12;
      const glass = ctx.createRadialGradient(MID - 4, cy - 20, 1, MID, cy - 10, 17);
      glass.addColorStop(0, '#ffffff');
      glass.addColorStop(0.4, dome);
      glass.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.ellipse(MID, cy - 4, 15, 18, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // The hull, a lens of metal with a bright seam.
      const metal = ctx.createLinearGradient(0, cy - 10, 0, cy + 10);
      metal.addColorStop(0, '#ffffff');
      metal.addColorStop(0.45, hull);
      metal.addColorStop(0.5, '#ffffff');
      metal.addColorStop(0.58, hull);
      metal.addColorStop(1, '#334155');
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.ellipse(MID, cy, 29, 8.5, 0, Math.PI, 0);
      ctx.ellipse(MID, cy, 29, 8.5, 0, 0, Math.PI);
      ctx.fill();
      // Lights along the rim.
      ctx.shadowColor = lights;
      ctx.shadowBlur = 6;
      ctx.fillStyle = lights;
      for (let k = 0; k < 5; k++) {
        const u = (k - 2) / 2.6;
        ctx.beginPath();
        ctx.arc(MID + u * 22, cy + 3 + (1 - u * u) * 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}
