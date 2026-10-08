// Drawing Pac-Man and the ghost. Geometry in world pixels, times in ms.

import type { Point } from '../board';

/** How wide Pac-Man's mouth opens at most, as a half angle. */
const MOUTH_MAX = 0.75;
/** How many times a second his mouth goes wakka. */
const CHOMPS_PER_S = 7;
/** The ghost is this wide either side of its middle. */
export const GHOST_R = 19.5;
/** The eye and the ghost are laid out for a Pac-Man and a ghost this big, and scaled to their sizes. */
const PAC_DRAWN = 15;
const GHOST_DRAWN = 13;

/** Which way Pac-Man faces, as an angle: right is 0, down is a quarter turn. */
export type Facing = number;

/**
 * Pac-Man at `at`, `r` in radius, facing `facing`, chomping `t` ms in; `dying` from 0 to 1 shrivels him away,
 * his mouth opening all the way round as he turns to face up, as in the game, and ends in a
 * little pop of lines.
 */
export function drawPacMan(
  ctx: CanvasRenderingContext2D,
  at: Point,
  r: number,
  facing: Facing,
  colour: string,
  t: number,
  dying = 0,
): void {
  if (dying < 1) {
    const chomp = MOUTH_MAX * Math.abs(Math.sin((t / 1000) * Math.PI * CHOMPS_PER_S)) + 0.04;
    const mouth = dying > 0 ? 0.3 + (Math.PI - 0.3) * dying : chomp;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(dying > 0 ? -Math.PI / 2 : facing);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    if (dying === 0) {
      // The eye, above his mouth whichever way he faces: turned round facing left, it is below.
      const k = r / PAC_DRAWN;
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(2 * k, Math.cos(facing) < -0.5 ? r * 0.5 : -r * 0.5, 2.2 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (dying > 0.85) drawPop(ctx, at, r, colour, Math.min(1, (dying - 0.85) / 0.15));
}

/** The spark of lines as the last of him goes, `u` from 0 to 1, sized for a Pac-Man `r` in radius. */
function drawPop(
  ctx: CanvasRenderingContext2D,
  at: Point,
  r: number,
  colour: string,
  u: number,
): void {
  const scale = r / PAC_DRAWN;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1 - u * 0.5;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r0 = (4 + 6 * u) * scale;
    const r1 = r0 + 5 * scale;
    ctx.moveTo(at.x + Math.cos(a) * r0, at.y + Math.sin(a) * r0);
    ctx.lineTo(at.x + Math.cos(a) * r1, at.y + Math.sin(a) * r1);
  }
  ctx.stroke();
  ctx.restore();
}

/** A ghost centred at `at`, its skirt rippling `t` ms in, its eyes on `target`. */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  at: Point,
  target: Point,
  colour: string,
  t: number,
): void {
  const r = GHOST_DRAWN;
  const hem = r * 0.95;
  const scallops = 4;
  const ripple = Math.sin(t / 90) * 2;
  const look = Math.atan2(target.y - at.y, target.x - at.x);
  ctx.save();
  // Drawn about its middle at its drawn size, then scaled up to GHOST_R.
  ctx.translate(at.x, at.y);
  ctx.scale(GHOST_R / GHOST_DRAWN, GHOST_R / GHOST_DRAWN);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(0, -2, r, Math.PI, 0);
  ctx.lineTo(r, hem);
  // The wavy hem, right to left.
  for (let k = 0; k < scallops; k++) {
    const x0 = r - (2 * r * k) / scallops;
    const x1 = r - (2 * r * (k + 1)) / scallops;
    ctx.quadraticCurveTo((x0 + x1) / 2, hem - 5 + (k % 2 === 0 ? ripple : -ripple), x1, hem);
  }
  ctx.closePath();
  ctx.fill();
  for (const ex of [-5, 5]) {
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.ellipse(ex, -3, 3.4, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1D4ED8';
    ctx.beginPath();
    ctx.arc(ex + Math.cos(look) * 1.6, -3 + Math.sin(look) * 1.8, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
