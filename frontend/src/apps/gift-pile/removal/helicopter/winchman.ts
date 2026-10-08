// Drawing the winchman, his rope and the vacuum hose up to the helicopter. Geometry in world
// pixels, with his feet as his position, times in ms.

import type { Gfx, Point } from '../board';
import { arcPoints, bezierPoints } from '../kit/vector';

/** How tall he is, from his feet to the top of his helmet. */
export const HEIGHT = 30;
/** From his feet to his hands, raised to hold the rope. */
export const HANDS_UP = HEIGHT + 4;
/** His vacuum's nozzle is this far in front of his feet, and this high off the ground. */
export const NOZZLE: Point = { x: 17, y: 3 };
/** Where the hose comes out of the tank on his back, from his feet, facing right. */
const TANK: Point = { x: -6, y: 18 };

const SUIT = '#F97316';
const SUIT_LIGHT = '#FED7AA';
const HELMET = '#F8FAFC';
const SKIN = '#FCD9B6';
const TANK_COLOUR = '#94A3B8';
const WAND = '#475569';
const ROPE = 'rgba(241, 245, 249, 0.9)';
const HOSE = '#64748B';
const HOSE_LIGHT = '#7dd3fc';
/** The suction cone's colour at the nozzle and at its rim. */
const CONE_NEAR = 'rgba(186, 230, 253, 0.35)';
const CONE_FAR = 'rgba(186, 230, 253, 0)';
/** How many pieces the hose and the suction fan are drawn in. */
const HOSE_SEGMENTS = 16;
const CONE_SEGMENTS = 8;

/** How he is: facing right (1) or left (-1), how far into his stride, and whether he is hanging on the rope. */
export interface Pose {
  facing: 1 | -1;
  stride: number;
  hanging: boolean;
}

/** Where the hose meets his tank, for a man with his feet at `at`. */
export function tankAt(at: Point, facing: 1 | -1): Point {
  return { x: at.x + TANK.x * facing, y: at.y - TANK.y };
}

/** The rope from the winch at `from` straight down to `to`. */
export function drawRope(gfx: Gfx, from: Point, to: Point): void {
  gfx.line(from.x, from.y, to.x, to.y, 2, 'rgba(100, 116, 139, 0.9)', { cap: 'butt' });
  gfx.line(from.x - 0.3, from.y, to.x - 0.3, to.y, 1, ROPE, { cap: 'butt' });
}

/** A lump going up the hose takes this long to get from his end to the helicopter, and at most this many show at once. */
export const LUMP_MS = 900;
const MAX_LUMPS = 14;

/**
 * The hose from the helicopter at `from` to his tank at `to`, sagging between them. While
 * `sucking` it wiggles, with streaks of air running up it, and `lumps` (each from 0 at his end
 * to 1 at the helicopter's) are what he has vacuumed, bulging the hose on their way up; with
 * more than fit, every so many show.
 */
export function drawHose(
  gfx: Gfx,
  from: Point,
  to: Point,
  t: number,
  sucking: boolean,
  lumps: readonly number[],
): void {
  const sag = 20 + Math.abs(to.x - from.x) * 0.25;
  const wiggle = sucking ? Math.sin(t / 90) * 3 : 0;
  const c = { x: (from.x + to.x) / 2 + wiggle, y: Math.max(from.y, to.y) + sag + wiggle * 0.5 };
  // A point on the hose, `s` from his end (0) to the helicopter's (1).
  const along = (s: number): Point => {
    const u = 1 - s;
    return {
      x: (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * c.x + u * u * to.x,
      y: (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * c.y + u * u * to.y,
    };
  };
  const curve = bezierPoints(from.x, from.y, c.x, c.y, to.x, to.y, HOSE_SEGMENTS);
  gfx.polyline(curve, 4, '#334155');
  gfx.polyline(curve, 2.4, HOSE);
  // Ribs along it, and a sheen on its upper side.
  gfx.polyline(curve, 2.4, '#1e293b', { dash: [1.1, 3], alpha: 0.55 });
  gfx.polyline(
    curve.map((v, k) => (k % 2 === 1 ? v - 0.7 : v)),
    0.8,
    '#cbd5e1',
    { alpha: 0.45 },
  );
  if (sucking) {
    // Light running up it from his end to the helicopter.
    gfx.polyline(curve, 1.4, HOSE_LIGHT, {
      dash: [4, 9],
      dashOffset: t / 6,
      blend: 'add',
      alpha: 0.8,
    });
  }
  const every = Math.max(1, Math.ceil(lumps.length / MAX_LUMPS));
  for (let k = 0; k < lumps.length; k += every) {
    const p = along(lumps[k]!);
    gfx.circle(p.x, p.y, 3.2, HOSE);
    gfx.glow(p.x, p.y, 8, '#fb923c', { intensity: 0.9 });
    gfx.circle(p.x - 0.6, p.y - 0.6, 1.4, 'rgba(253, 186, 116, 0.9)');
  }
}

/** Air rushing into the nozzle at `at` from below and ahead of it, facing `facing`, `t` ms in. */
export function drawSuction(gfx: Gfx, at: Point, facing: 1 | -1, t: number): void {
  const reach = 30;
  const toward = Math.PI / 2 - facing * 0.35;
  gfx.glow(at.x, at.y, 12, '#7dd3fc', { intensity: 0.9 });
  // A faint cone of suction, fading out from the nozzle.
  const rim = arcPoints(at.x, at.y, reach, toward - 1.1, toward + 1.1, CONE_SEGMENTS);
  for (let k = 0; k < CONE_SEGMENTS; k++) {
    gfx.quad(
      [at.x, at.y, rim[2 * k]!, rim[2 * k + 1]!, rim[2 * k + 2]!, rim[2 * k + 3]!, at.x, at.y],
      [CONE_NEAR, CONE_FAR, CONE_FAR, CONE_NEAR],
      { blend: 'add' },
    );
  }
  // Streaks rushing in, each from somewhere in the fan and faster as it nears.
  const streaks = 7;
  for (let k = 0; k < streaks; k++) {
    const u = (t / 320 + k / streaks) % 1;
    const a = toward + (((k * 3) % streaks) / (streaks - 1) - 0.5) * 2;
    const r0 = reach * (1 - u * u);
    const r1 = Math.max(1, r0 - 7);
    gfx.line(
      at.x + Math.cos(a) * r0,
      at.y + Math.sin(a) * r0,
      at.x + Math.cos(a) * r1,
      at.y + Math.sin(a) * r1,
      1.2,
      '#e0f2fe',
      { alpha: 0.85 * Math.sin(Math.PI * u) },
    );
  }
}

/** The winchman with his feet at `at`, posed as `pose`: walking with his nozzle to the ground, or hanging from the rope. */
export function drawWinchman(gfx: Gfx, at: Point, pose: Pose): void {
  const { facing: f, stride, hanging } = pose;
  const { x, y } = at;
  const hip = { x, y: y - 11 };
  const shoulder = { x, y: y - 21 };
  // The tank on his back.
  gfx.rect(x + TANK.x * f - 3, y - 22, 6, 12, TANK_COLOUR, { radius: 2 });
  // Legs: swinging as he walks, dangling as he hangs.
  const swing = hanging ? 0.15 : Math.sin(stride) * 0.5;
  for (const s of [swing, -swing]) {
    gfx.line(hip.x, hip.y, hip.x + Math.sin(s) * 11, hip.y + Math.cos(s) * 11, 3.5, SUIT);
  }
  // Body, with a lighter edge where the light catches it.
  gfx.line(hip.x, hip.y, shoulder.x, shoulder.y, 5, SUIT);
  gfx.line(hip.x - 1.8 * f, hip.y - 1, shoulder.x - 1.8 * f, shoulder.y + 1, 1.2, SUIT_LIGHT);
  // Arms: up the rope, or down to the wand, and the wand to the nozzle.
  if (hanging) gfx.line(shoulder.x, shoulder.y, x + 1, y - HANDS_UP, 2.5, SUIT);
  else gfx.line(shoulder.x, shoulder.y + 1, x + 9 * f, y - 13, 2.5, SUIT);
  if (!hanging) {
    gfx.line(x + 8 * f, y - 14, x + NOZZLE.x * f, y - NOZZLE.y, 2, WAND);
    gfx.line(x + (NOZZLE.x - 3) * f, y - NOZZLE.y, x + (NOZZLE.x + 2) * f, y - NOZZLE.y, 3.5, WAND);
  }
  // Head and helmet.
  gfx.circle(x + f, y - 25, 3.6, SKIN);
  gfx.wedge(x + f * 0.5, y - 26.5, 4.2, Math.PI, 2 * Math.PI, HELMET);
  // The visor glints.
  gfx.glow(x + 2.2 * f, y - 25.4, 4, '#7dd3fc', { intensity: 1.2 });
}
