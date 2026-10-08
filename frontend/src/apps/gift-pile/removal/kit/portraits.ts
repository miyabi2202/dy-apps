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

// Helicopter
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
