import type { SpriteSource } from '../board';

// The saucer's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;
const MID = SIZE / 2;

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
