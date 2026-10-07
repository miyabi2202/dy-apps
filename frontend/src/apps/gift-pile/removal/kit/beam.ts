// The tractor beam a craft can shine down from its belly instead of towing a vacuum.
// Geometry is in world (CSS) pixels.

import type { Intake, Openings } from './craft';

/** How far down the beam shows, and its half width at the top and at the bottom. */
const LENGTH = 170;
const TOP_HALF = 10;
const BOTTOM_HALF = 50;
/** Rings of light rise up the beam, this many at a time, each taking this long. */
const RINGS = 3;
const RING_MS = 900;

/** The beam's half width `d` px below its top. */
const halfAt = (d: number) => TOP_HALF + ((BOTTOM_HALF - TOP_HALF) * d) / LENGTH;

/** The beam from (x, y) down, with rings of light rising up it, `now` ms in. */
function drawBeam(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  const bottom = y + LENGTH;
  const glow = ctx.createLinearGradient(0, y, 0, bottom);
  glow.addColorStop(0, 'rgba(252, 213, 63, 0.5)');
  glow.addColorStop(1, 'rgba(252, 213, 63, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(x - TOP_HALF, y);
  ctx.lineTo(x - BOTTOM_HALF, bottom);
  ctx.lineTo(x + BOTTOM_HALF, bottom);
  ctx.lineTo(x + TOP_HALF, y);
  ctx.closePath();
  ctx.fill();
  // Rings rising from the bottom, brightening and narrowing as they near the craft.
  ctx.save();
  ctx.lineWidth = 1.5;
  for (let i = 0; i < RINGS; i++) {
    const u = (now / RING_MS + i / RINGS) % 1;
    const d = LENGTH * (1 - u) * 0.9;
    const half = halfAt(d);
    ctx.strokeStyle = `rgba(254, 240, 138, ${(0.7 * u).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y + d, half, half * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** A tractor beam from the tie point: icons rise straight up it, and the ones dropped fall back out. */
export class TractorBeam implements Intake {
  readonly reach = 0;

  openings(tieX: number, tieY: number): Openings {
    return { inX: tieX, inY: tieY, outX: tieX, outY: tieY };
  }

  draw(ctx: CanvasRenderingContext2D, tieX: number, tieY: number, t: number): void {
    drawBeam(ctx, tieX, tieY, t);
  }
}
