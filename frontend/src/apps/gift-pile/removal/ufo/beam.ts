// The saucer's tractor beam. Geometry is in world (CSS) pixels.

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
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  { length, bottomHalf, strength }: BeamShape,
  t: number,
): void {
  if (strength <= 0 || length <= 0) return;
  const bottom = y + length;
  const halfAt = (d: number) => TOP_HALF + ((bottomHalf - TOP_HALF) * d) / length;
  ctx.save();
  ctx.globalAlpha = Math.min(1, strength);
  const glow = ctx.createLinearGradient(0, y, 0, bottom);
  glow.addColorStop(0, 'rgba(252, 213, 63, 0.55)');
  glow.addColorStop(1, 'rgba(252, 213, 63, 0.08)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(x - TOP_HALF, y);
  ctx.lineTo(x - bottomHalf, bottom);
  ctx.lineTo(x + bottomHalf, bottom);
  ctx.lineTo(x + TOP_HALF, y);
  ctx.closePath();
  ctx.fill();
  // A pool of light where it meets the pile.
  ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
  ctx.beginPath();
  ctx.ellipse(x, bottom, bottomHalf, bottomHalf * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rings rising from the bottom, brightening and narrowing as they near the saucer.
  ctx.lineWidth = 1.5;
  for (let i = 0; i < RINGS; i++) {
    const u = (t / RING_MS + i / RINGS) % 1;
    const d = length * (1 - u) * 0.95;
    const half = halfAt(d);
    ctx.strokeStyle = `rgba(254, 240, 138, ${(0.7 * u).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y + d, half, half * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
