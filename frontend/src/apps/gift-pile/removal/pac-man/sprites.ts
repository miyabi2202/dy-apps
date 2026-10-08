// Drawing Pac-Man and the ghost: the shapes shader does it all (`Gfx.pacMan`, `ghost`,
// `arcadePop`). Geometry in world pixels, times in ms.

import type { Gfx, Point } from '../board';

/** Pac-Man's radius, always the same, and how wide his mouth opens at most, as a half angle. */
export const PAC_R = 22.5;
const MOUTH_MAX = 0.75;
/** How many times a second his mouth goes wakka. */
const CHOMPS_PER_S = 7;
/** The ghost is this wide either side of its middle. */
export const GHOST_R = 19.5;

/** Which way Pac-Man faces, as an angle: right is 0, down is a quarter turn. */
export type Facing = number;

/**
 * Pac-Man at `at`, facing `facing`, chomping `t` ms in; `dying` from 0 to 1 shrivels him away,
 * his mouth opening all the way round as he turns to face up, as in the game, and ends in a
 * little pop of light.
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
    gfx.pacMan(at.x, at.y, PAC_R, {
      color: colour,
      facing: dying > 0 ? -Math.PI / 2 : facing,
      mouth,
      dying,
    });
  }
  if (dying > 0.85) {
    gfx.arcadePop(at.x, at.y, PAC_R * 2.2, {
      color: colour,
      progress: Math.min(1, (dying - 0.85) / 0.15),
    });
  }
}

/** A ghost centred at `at`, its eyes on `target`. */
export function drawGhost(
  gfx: Gfx,
  at: Point,
  target: Point,
  colour: string,
  scared = false,
): void {
  gfx.ghost(at.x, at.y, GHOST_R, {
    color: colour,
    look: Math.atan2(target.y - at.y, target.x - at.x),
    scared,
  });
}
