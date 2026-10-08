// Drawing the winchman, his rope and the vacuum hose up to the helicopter. Geometry in world
// pixels, with his feet as his position, times in ms.

import type { Point } from '../board';

/** How tall he is, from his feet to the top of his helmet. */
export const HEIGHT = 30;
/** From his feet to his hands, raised to hold the rope. */
export const HANDS_UP = HEIGHT + 4;
/** His vacuum's nozzle is this far in front of his feet, and this high off the ground. */
export const NOZZLE: Point = { x: 17, y: 3 };
/** Where the hose comes out of the tank on his back, from his feet, facing right. */
const TANK: Point = { x: -6, y: 18 };

const SUIT = '#F97316';
const HELMET = '#F8FAFC';
const SKIN = '#FCD9B6';
const TANK_COLOUR = '#94A3B8';
const WAND = '#475569';
const ROPE = 'rgba(241, 245, 249, 0.9)';
const HOSE = '#64748B';

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
export function drawRope(ctx: CanvasRenderingContext2D, from: Point, to: Point): void {
  ctx.save();
  ctx.strokeStyle = ROPE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * The hose from the helicopter at `from` to his tank at `to`, sagging between them, with
 * dashes running up it towards the helicopter `t` ms in while `sucking`.
 */
export function drawHose(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  t: number,
  sucking: boolean,
): void {
  const sag = 20 + Math.abs(to.x - from.x) * 0.25;
  const cx = (from.x + to.x) / 2;
  const cy = Math.max(from.y, to.y) + sag;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = HOSE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(cx, cy, to.x, to.y);
  ctx.stroke();
  if (sucking) {
    ctx.strokeStyle = 'rgba(253, 186, 116, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 7]);
    // Dashes running from his end up to the helicopter.
    ctx.lineDashOffset = t / 8;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(cx, cy, to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** The winchman with his feet at `at`, posed as `pose`: walking with his nozzle to the ground, or hanging from the rope. */
export function drawWinchman(ctx: CanvasRenderingContext2D, at: Point, pose: Pose): void {
  const { facing: f, stride, hanging } = pose;
  const { x, y } = at;
  const hip = { x, y: y - 11 };
  const shoulder = { x, y: y - 21 };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The tank on his back.
  ctx.fillStyle = TANK_COLOUR;
  ctx.beginPath();
  ctx.roundRect(x + TANK.x * f - 3, y - 22, 6, 12, 2);
  ctx.fill();
  // Legs: swinging as he walks, dangling as he hangs.
  ctx.strokeStyle = SUIT;
  ctx.lineWidth = 3.5;
  const swing = hanging ? 0.15 : Math.sin(stride) * 0.5;
  for (const s of [swing, -swing]) {
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(hip.x + Math.sin(s) * 11, hip.y + Math.cos(s) * 11);
    ctx.stroke();
  }
  // Body.
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(shoulder.x, shoulder.y);
  ctx.stroke();
  // Arms: up the rope, or down to the wand, and the wand to the nozzle.
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (hanging) {
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(x + 1, y - HANDS_UP);
  } else {
    ctx.moveTo(shoulder.x, shoulder.y + 1);
    ctx.lineTo(x + 9 * f, y - 13);
  }
  ctx.stroke();
  if (!hanging) {
    ctx.strokeStyle = WAND;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8 * f, y - 14);
    ctx.lineTo(x + NOZZLE.x * f, y - NOZZLE.y);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x + (NOZZLE.x - 3) * f, y - NOZZLE.y);
    ctx.lineTo(x + (NOZZLE.x + 2) * f, y - NOZZLE.y);
    ctx.stroke();
  }
  // Head and helmet.
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(x + f, y - 25, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = HELMET;
  ctx.beginPath();
  ctx.arc(x + f * 0.5, y - 26.5, 4.2, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}
