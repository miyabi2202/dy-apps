import type { SpriteSource } from '../board';

// Small pictures of the removers, for the cut-in banner. Each is painted once, 64 × 64, with
// Canvas2D, in a colour the remover picks.

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
