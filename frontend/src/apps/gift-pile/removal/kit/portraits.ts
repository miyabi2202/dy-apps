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
