// Drawing the helicopter: a procedural rescue helicopter from a shader (`shader.ts`), facing right, its
// rotors turning. Geometry in world pixels, times in ms.

import type { Gfx, Point } from '../board';
import { drawChopperShader, UNIT } from './shader';

/** What a helicopter is painted with: its body, the stripe along it, and the tint of its cockpit glass. */
export interface ChopperScheme {
  body: string;
  stripe: string;
  glass?: string;
}

/** From the cabin's middle to the winch under the skids, where the rope comes down. */
export const WINCH: Point = { x: 2, y: 27 };
/** Where the rotor's hub is from the cabin's middle, and how far its blades reach, world px (before tilt). */
export const ROTOR: Point = { x: 1.5 * UNIT, y: -9.8 * UNIT };
export const ROTOR_REACH = 10 * UNIT;
/** Where the belly is, under the cabin, where the searchlight shines from. */
export const BELLY: Point = { x: 6, y: 18 };

/** The helicopter in `scheme`, its cabin's middle at `at`, turned by `tilt` (positive: nose down), `t` ms in. */
export function drawChopper(
  gfx: Gfx,
  scheme: ChopperScheme,
  at: Point,
  tilt: number,
  t: number,
): void {
  drawChopperShader(gfx, at.x, at.y, tilt, t, scheme);
}
