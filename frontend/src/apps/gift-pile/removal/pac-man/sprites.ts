// Drawing Pac-Man and the ghost. Geometry in world pixels, times in ms.

import type { Gfx, Point } from '../board';
import { arcPoints, bezierPoints } from '../kit/vector';

/** Pac-Man's radius, always the same, and how wide his mouth opens at most, as a half angle. */
export const PAC_R = 22.5;
const MOUTH_MAX = 0.75;
/** How many times a second his mouth goes wakka. */
const CHOMPS_PER_S = 7;
/** The ghost is this wide either side of its middle. */
export const GHOST_R = 19.5;
/** The drawings below are laid out for a Pac-Man and a ghost this big, and scaled to the sizes above. */
const PAC_DRAWN = 15;
const GHOST_DRAWN = 13;

/** Which way Pac-Man faces, as an angle: right is 0, down is a quarter turn. */
export type Facing = number;

/**
 * Pac-Man at `at`, facing `facing`, chomping `t` ms in; `dying` from 0 to 1 shrivels him away,
 * his mouth opening all the way round as he turns to face up, as in the game, and ends in a
 * little pop of lines.
 */
export function drawPacMan(
  gfx: Gfx,
  at: Point,
  facing: Facing,
  colour: string,
  t: number,
  dying = 0,
): void {
  if (dying < 1) {
    const chomp = MOUTH_MAX * Math.abs(Math.sin((t / 1000) * Math.PI * CHOMPS_PER_S)) + 0.04;
    const mouth = dying > 0 ? 0.3 + (Math.PI - 0.3) * dying : chomp;
    // A neon halo behind him, fading as he goes.
    gfx.glow(at.x, at.y, PAC_R * 1.7, colour, { intensity: 0.45 * (1 - dying) });
    gfx.push(at.x, at.y, dying > 0 ? -Math.PI / 2 : facing);
    gfx.wedge(0, 0, PAC_R, mouth, Math.PI * 2 - mouth, colour, {
      stroke: { width: 1.5, color: '#fef9c3' },
    });
    // The light on his upper side, and a rim of it.
    gfx.circle(-PAC_R * 0.3, -PAC_R * 0.3, PAC_R * 0.5, '#ffffff', { alpha: 0.15, soft: 6 });
    gfx.glow(-PAC_R * 0.35, -PAC_R * 0.4, PAC_R * 0.5, '#ffffff', { intensity: 0.25 });
    if (dying === 0) {
      // The eye, above his mouth whichever way he faces: turned round facing left, it is below.
      const k = PAC_R / PAC_DRAWN;
      gfx.circle(2 * k, Math.cos(facing) < -0.5 ? PAC_R * 0.5 : -PAC_R * 0.5, 2.2 * k, '#0F172A');
    }
    gfx.pop();
  }
  if (dying > 0.85) drawPop(gfx, at, colour, Math.min(1, (dying - 0.85) / 0.15));
}

/** The pop as the last of him goes, `u` from 0 to 1: a ring and a flash, and lines flying out . */
function drawPop(gfx: Gfx, at: Point, colour: string, u: number): void {
  gfx.ring(at.x, at.y, 6 + 40 * u, 3 * (1 - u) + 0.5, colour, { alpha: 1 - u, blend: 'add' });
  gfx.glow(at.x, at.y, 30 + 20 * u, '#fef9c3', { intensity: 1.4 * (1 - u) });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.2;
    const r0 = 4 + 18 * u;
    const r1 = r0 + 6 + 6 * (k % 2);
    gfx.line(
      at.x + Math.cos(a) * r0,
      at.y + Math.sin(a) * r0,
      at.x + Math.cos(a) * r1,
      at.y + Math.sin(a) * r1,
      2,
      colour,
      { alpha: 1 - u * 0.5, blend: 'add' },
    );
  }
}

/** A ghost centred at `at`, its skirt rippling `t` ms in, its eyes on `target`. */
export function drawGhost(
  gfx: Gfx,
  at: Point,
  target: Point,
  colour: string,
  t: number,
  scared = false,
): void {
  const r = GHOST_DRAWN;
  const hem = r * 0.95;
  const scallops = 4;
  const ripple = Math.sin(t / 90) * 2;
  const look = Math.atan2(target.y - at.y, target.x - at.x);
  gfx.glow(at.x, at.y, GHOST_R * 1.9, colour, { intensity: 0.3 });
  // Drawn about its middle at its drawn size, then scaled up to GHOST_R.
  gfx.push(at.x, at.y, 0, GHOST_R / GHOST_DRAWN);
  // The round top, the sides, and the wavy hem, right to left.
  const body = arcPoints(0, -2, r, Math.PI, Math.PI * 2, 14);
  body.push(r, hem);
  for (let k = 0; k < scallops; k++) {
    const x0 = r - (2 * r * k) / scallops;
    const x1 = r - (2 * r * (k + 1)) / scallops;
    const curve = bezierPoints(
      x0,
      hem,
      (x0 + x1) / 2,
      hem - 5 + (k % 2 === 0 ? ripple : -ripple),
      x1,
      hem,
      6,
    );
    body.push(...curve.slice(2));
  }
  gfx.polygon(body, colour, { stroke: { width: 0.8, color: '#ffffff' } });
  // A highlight over its brow.
  gfx.ellipse(-4, -9, 4.5, 2, -0.4, '#ffffff', { alpha: 0.3 });
  for (const ex of [-5, 5]) {
    gfx.ellipse(ex, -3, 3.4, 4.2, 0, '#F8FAFC');
    gfx.circle(ex + Math.cos(look) * 1.6, -3 + Math.sin(look) * 1.8, 1.9, '#1D4ED8');
    gfx.glow(ex + Math.cos(look) * 1.6, -3 + Math.sin(look) * 1.8, 3.4, '#60a5fa', {
      intensity: 1.2,
    });
  }
  if (scared) gfx.line(-6, 5, 6, 5, 1, '#ffffff', { alpha: 0.8 });
  gfx.pop();
}
