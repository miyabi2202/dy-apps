// The saucer's tractor beam. Geometry is in world (CSS) pixels.

import type { Gfx } from '../board';

/** The beam's colour where it leaves the saucer and at its far end. */
const GLOW_TOP = 'rgba(252, 213, 63, 0.4)';
const GLOW_BOTTOM = 'rgba(252, 213, 63, 0.1)';

/** The beam's half width where it leaves the saucer. */
const TOP_HALF = 10;
/** Rings of light rise up the beam, this many at a time, each taking this long. */
const RINGS = 3;
const RING_MS = 900;

/** How the beam is drawn: how far down it reaches, how wide it is there, and how strongly it shines (0 to 1). */
export interface BeamShape {
  length: number;
  bottomHalf: number;
  strength: number;
}

/** The beam from the saucer's belly at (x, y) down, with rings of light rising up it, `t` ms in. */
export function drawBeam(
  gfx: Gfx,
  x: number,
  y: number,
  { length, bottomHalf, strength }: BeamShape,
  t: number,
): void {
  if (strength <= 0 || length <= 0) return;
  const bottom = y + length;
  const halfAt = (d: number) => TOP_HALF + ((bottomHalf - TOP_HALF) * d) / length;
  // It flickers a little, as a beam does.
  const alpha = Math.min(1, strength) * (0.92 + 0.08 * Math.sin(t / 37));
  gfx.quad(
    [x - TOP_HALF, y, x + TOP_HALF, y, x + bottomHalf, bottom, x - bottomHalf, bottom],
    [GLOW_TOP, GLOW_TOP, GLOW_BOTTOM, GLOW_BOTTOM],
    { alpha, blend: 'add' },
  );
  // Bands of light scrolling up it, each cut to the beam's width.
  const bands = Math.max(2, Math.round(length / 22));
  for (let k = 0; k < bands; k++) {
    const u = (k / bands + t / 1500) % 1;
    const d = length * (1 - u);
    const h = Math.min(8, length - d);
    if (h <= 0) continue;
    const h0 = halfAt(d);
    const h1 = halfAt(d + h);
    const a = `rgba(254, 249, 195, ${0.16 * Math.sin(Math.PI * u)})`;
    gfx.quad([x - h0, y + d, x + h0, y + d, x + h1, y + d + h, x - h1, y + d + h], [a, a, a, a], {
      blend: 'add',
      alpha,
    });
  }
  // Bright edges.
  gfx.line(x - TOP_HALF, y, x - bottomHalf, bottom, 1.5, '#fef08a', {
    alpha: 0.5 * alpha,
    blend: 'add',
  });
  gfx.line(x + TOP_HALF, y, x + bottomHalf, bottom, 1.5, '#fef08a', {
    alpha: 0.5 * alpha,
    blend: 'add',
  });
  // A pool of light where it meets the pile.
  gfx.ellipse(x, bottom, bottomHalf, bottomHalf * 0.2, 0, 'rgba(254, 240, 138, 0.18)', {
    alpha,
    blend: 'add',
  });
  gfx.glow(x, bottom, bottomHalf * 1.2, '#fde047', { intensity: 0.22 * alpha });
  // Rings rising from the bottom, brightening and narrowing as they near the saucer.
  for (let i = 0; i < RINGS; i++) {
    const u = (t / RING_MS + i / RINGS) % 1;
    const d = length * (1 - u) * 0.95;
    const half = halfAt(d);
    gfx.ellipseStroke(x, y + d, half, half * 0.18, 0, 1.5, '#FEF08A', {
      alpha: alpha * 0.7 * u,
      blend: 'add',
    });
  }
}
