// The saucer's tractor beam: a plasma beam drawn in a shader (`shader.ts`), with rings
// of light rising up it. Geometry is in world (CSS) pixels.

import type { Gfx } from '../board';
import { drawBeamShader } from './shader';

/** The beam's half width where it leaves the saucer. */
const TOP_HALF = 10;
/** Rings of light rise up the beam, this many at a time, each taking this long. */
const RINGS = 3;
const RING_MS = 900;

/** How the beam is drawn: how far down it reaches, how wide it is there, how strongly it shines (0 to 1), and its colour. */
export interface BeamShape {
  length: number;
  bottomHalf: number;
  strength: number;
  color: string;
}

/** The beam from the saucer's belly at (x, y) down, with rings of light rising up it, `t` ms in. */
export function drawBeam(
  gfx: Gfx,
  x: number,
  y: number,
  { length, bottomHalf, strength, color }: BeamShape,
  t: number,
): void {
  if (strength <= 0 || length <= 0) return;
  const bottom = y + length;
  const halfAt = (d: number) => TOP_HALF + ((bottomHalf - TOP_HALF) * d) / length;
  // It flickers a little, as a beam does.
  const alpha = Math.min(1, strength) * (0.94 + 0.06 * Math.sin(t / 37));
  drawBeamShader(gfx, x, y, TOP_HALF, bottomHalf, length, alpha, color);
  gfx.glow(x, bottom, bottomHalf * 1.2, color, { intensity: 0.22 * alpha });
  // Rings rising from the bottom, brightening and narrowing as they near the saucer.
  for (let i = 0; i < RINGS; i++) {
    const u = (t / RING_MS + i / RINGS) % 1;
    const d = length * (1 - u) * 0.95;
    const half = halfAt(d);
    gfx.ellipseStroke(x, y + d, half, half * 0.18, 0, 1.5, '#ffffff', {
      alpha: alpha * 0.55 * u,
      blend: 'add',
    });
  }
}
