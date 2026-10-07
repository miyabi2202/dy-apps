// The vacuum cleaner most crafts tow: a canister on a rope, a hose to a nozzle, and the
// cone of suction below it. Geometry is in world (CSS) pixels.

import type { Intake, Openings } from './craft';

/** The rope from where it ties on to the canister, and how far behind the tie the canister trails. */
const ROPE = 18;
const TRAIL = 14;
/** The canister's body, and the nozzle's width and how far below the canister it hangs. */
const BODY_W = 22;
const BODY_H = 13;
const NOZZLE_W = 16;
const NOZZLE_DROP = 16;
/** The suction cone below the nozzle: how far down it shows and how wide it gets. */
const CONE_LENGTH = 110;
const CONE_HALF_WIDTH = 42;

/** From where the rope ties on down to the nozzle, when the rope hangs straight. */
export const TIE_TO_NOZZLE = ROPE + BODY_H / 2 + NOZZLE_DROP;

/** Where the vacuum's parts are: the canister's centre, the nozzle, and the exhaust extras come out of. */
export interface VacuumPose {
  cx: number;
  cy: number;
  nx: number;
  ny: number;
  exhaustX: number;
  exhaustY: number;
}

/** The vacuum hanging from (tieX, tieY), `t` ms into the pass: it swings a little on its rope. */
export function vacuumAt(tieX: number, tieY: number, t: number): VacuumPose {
  const cx = tieX - TRAIL + Math.sin(t / 310) * 3;
  const cy = tieY + ROPE + BODY_H / 2;
  return {
    cx,
    cy,
    nx: cx - 4,
    ny: cy + NOZZLE_DROP,
    exhaustX: cx - BODY_W / 2 - 4,
    exhaustY: cy + BODY_H / 2,
  };
}

/** The cone of air drawn into the nozzle, with streaks racing up it. */
export function drawSuction(ctx: CanvasRenderingContext2D, pose: VacuumPose, now: number): void {
  const { nx, ny } = pose;
  const bottom = ny + CONE_LENGTH;
  const cone = ctx.createLinearGradient(0, ny, 0, bottom);
  cone.addColorStop(0, 'rgba(147, 197, 253, 0.28)');
  cone.addColorStop(1, 'rgba(147, 197, 253, 0)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(nx - NOZZLE_W / 2, ny);
  ctx.lineTo(nx - CONE_HALF_WIDTH, bottom);
  ctx.lineTo(nx + CONE_HALF_WIDTH, bottom);
  ctx.lineTo(nx + NOZZLE_W / 2, ny);
  ctx.closePath();
  ctx.fill();
  // Dashes sliding up the cone's edges and middle.
  ctx.save();
  ctx.strokeStyle = 'rgba(191, 219, 254, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 10]);
  ctx.lineDashOffset = now / 12;
  ctx.beginPath();
  for (const f of [-0.7, 0, 0.7]) {
    ctx.moveTo(nx + f * CONE_HALF_WIDTH, bottom - 10);
    ctx.lineTo(nx + f * (NOZZLE_W / 2) * 0.8, ny + 2);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The rope from (tieX, tieY), the canister with a window showing how full it is (0 to 1),
 * the hose and the nozzle.
 */
export function drawVacuum(
  ctx: CanvasRenderingContext2D,
  tieX: number,
  tieY: number,
  pose: VacuumPose,
  fullness: number,
): void {
  const { cx, cy, nx, ny } = pose;
  ctx.lineCap = 'round';
  // Rope.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tieX, tieY);
  ctx.lineTo(cx, cy - BODY_H / 2);
  ctx.stroke();
  // Hose: a curve from the canister's underside to the nozzle.
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy + BODY_H / 2 - 2);
  ctx.quadraticCurveTo(cx - 9, cy + NOZZLE_DROP * 0.6, nx, ny - 2);
  ctx.stroke();
  // Canister body with a window showing how full it is.
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cx - BODY_W / 2, cy - BODY_H / 2, BODY_W, BODY_H, BODY_H / 2);
  ctx.fill();
  ctx.stroke();
  const winW = BODY_W * 0.45;
  const winH = BODY_H * 0.55;
  const winX = cx - winW / 2 + 2;
  const winY = cy - winH / 2;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(winX, winY, winW, winH);
  const level = winH * Math.min(1, fullness);
  ctx.fillStyle = '#fb7185';
  ctx.fillRect(winX, winY + winH - level, winW, level);
  // Exhaust at the back, where extras come out.
  ctx.fillStyle = '#475569';
  ctx.fillRect(cx - BODY_W / 2 - 3, cy - 2, 4, 4);
  // Nozzle.
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(nx - 3, ny - 5);
  ctx.lineTo(nx + 3, ny - 5);
  ctx.lineTo(nx + NOZZLE_W / 2, ny);
  ctx.lineTo(nx - NOZZLE_W / 2, ny);
  ctx.closePath();
  ctx.fill();
}

/** The vacuum as a craft's intake: icons are sucked into the nozzle and spat out of the exhaust. */
export class Vacuum implements Intake {
  readonly reach = TIE_TO_NOZZLE;

  openings(tieX: number, tieY: number, t: number): Openings {
    const { nx, ny, exhaustX, exhaustY } = vacuumAt(tieX, tieY, t);
    return { inX: nx, inY: ny, outX: exhaustX, outY: exhaustY };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    tieX: number,
    tieY: number,
    t: number,
    fullness: number,
  ): void {
    const pose = vacuumAt(tieX, tieY, t);
    drawSuction(ctx, pose, t);
    drawVacuum(ctx, tieX, tieY, pose, fullness);
  }
}
