// Drawing the helicopter: the Fluent Emoji art, mirrored to face right, with its rotors
// drawn turning over it. Geometry in world pixels, times in ms.

import type { Point } from '../board';
import type { Recolour, SvgArt } from '../kit/svg-art';

const SIZE = 76;
/** The middle of the cabin, in the art's 32×32 view box, which faces left. */
const CX = 14;
const CY = 17;
/** From the cabin's middle to the winch under the skids, where the rope comes down. */
export const WINCH: Point = { x: 2, y: 27 };
/**
 * The rotors, in the art's view box: the main rotor's hub atop the mast and its blades'
 * reach, seen edge on; the tail rotor's hub and its blades' reach, seen face on. The art's
 * own grey for the blades, and how fast each turns, in radians per ms.
 */
const MAIN_HUB = { x: 12.5, y: 7.2 };
const MAIN_REACH = 10;
const TAIL_HUB = { x: 27, y: 12 };
const TAIL_REACH = 3.4;
const BLADE = '#B4ACBC';
const MAIN_SPIN = 0.045;
const TAIL_SPIN = 0.06;

/** The helicopter in `scheme`, its cabin's middle at `at`, turned by `tilt` (positive: nose down), `t` ms in. */
export function drawChopper(
  ctx: CanvasRenderingContext2D,
  art: SvgArt,
  scheme: Recolour,
  at: Point,
  tilt: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(tilt);
  art.draw(ctx, scheme, { size: SIZE, cx: CX, cy: CY, mirror: true });
  drawRotors(ctx, t);
  ctx.restore();
}

/**
 * The rotors `t` ms in, in the art's view box. The main rotor's two blades, seen edge on,
 * sweep out and back as they turn, over the faint disc they blur into; the tail rotor's turn
 * face on.
 */
function drawRotors(ctx: CanvasRenderingContext2D, t: number): void {
  const { x, y } = MAIN_HUB;
  ctx.fillStyle = 'rgba(180, 172, 188, 0.3)';
  ctx.beginPath();
  ctx.roundRect(x - MAIN_REACH, y - 0.5, 2 * MAIN_REACH, 1, 0.5);
  ctx.fill();
  const reach = MAIN_REACH * Math.abs(Math.cos(t * MAIN_SPIN));
  ctx.fillStyle = BLADE;
  ctx.beginPath();
  ctx.roundRect(x - reach, y - 0.9, 2 * reach, 1.8, 0.9);
  ctx.fill();

  ctx.strokeStyle = BLADE;
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const turn of [0, Math.PI / 2]) {
    const a = t * TAIL_SPIN + turn;
    const dx = TAIL_REACH * Math.cos(a);
    const dy = TAIL_REACH * Math.sin(a);
    ctx.moveTo(TAIL_HUB.x - dx, TAIL_HUB.y - dy);
    ctx.lineTo(TAIL_HUB.x + dx, TAIL_HUB.y + dy);
  }
  ctx.stroke();
  ctx.fillStyle = '#E6E6E6';
  ctx.beginPath();
  ctx.arc(TAIL_HUB.x, TAIL_HUB.y, 0.9, 0, Math.PI * 2);
  ctx.fill();
}
