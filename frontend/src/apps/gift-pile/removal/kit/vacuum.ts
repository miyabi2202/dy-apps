// The vacuum cleaner most crafts tow: a canister on a rope, a hose to a nozzle, and the
// cone of suction below it. Geometry is in world (CSS) pixels.

import type { Gfx } from '../board';
import type { Intake, Openings } from './craft';
import { bezierPoints } from './vector';

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

/** The cone's colour at the nozzle and at its far end, and its streaks'. */
const CONE_NEAR = 'rgba(147, 197, 253, 0.28)';
const CONE_FAR = 'rgba(147, 197, 253, 0)';
const STREAK = 'rgba(191, 219, 254, 0.5)';

/** From where the rope ties on down to the nozzle, when the rope hangs straight. */
const TIE_TO_NOZZLE = ROPE + BODY_H / 2 + NOZZLE_DROP;

/** Where the vacuum's parts are: the canister's centre, the nozzle, and the exhaust extras come out of. */
interface VacuumPose {
  cx: number;
  cy: number;
  nx: number;
  ny: number;
  exhaustX: number;
  exhaustY: number;
}

/** The vacuum hanging from (tieX, tieY), `t` ms into the crossing: it swings a little on its rope. */
function vacuumAt(tieX: number, tieY: number, t: number): VacuumPose {
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
function drawSuction(gfx: Gfx, pose: VacuumPose, now: number): void {
  const { nx, ny } = pose;
  const bottom = ny + CONE_LENGTH;
  gfx.quad(
    [
      nx - NOZZLE_W / 2,
      ny,
      nx + NOZZLE_W / 2,
      ny,
      nx + CONE_HALF_WIDTH,
      bottom,
      nx - CONE_HALF_WIDTH,
      bottom,
    ],
    [CONE_NEAR, CONE_NEAR, CONE_FAR, CONE_FAR],
    { blend: 'add' },
  );
  // Rings of light drawn up it, brighter as they near the nozzle.
  for (let k = 0; k < 3; k++) {
    const u = (now / 700 + k / 3) % 1;
    const half = NOZZLE_W / 2 + (CONE_HALF_WIDTH - NOZZLE_W / 2) * u;
    gfx.ellipseStroke(nx, ny + CONE_LENGTH * u, half, half * 0.22, 0, 1.4, '#bfdbfe', {
      alpha: 0.6 * (1 - u),
      blend: 'add',
    });
  }
  gfx.glow(nx, ny + 2, 16, '#93c5fd', { intensity: 0.8 });
  // Dashes sliding up the cone's edges and middle.
  for (const f of [-0.7, 0, 0.7]) {
    gfx.line(
      nx + f * CONE_HALF_WIDTH,
      bottom - 10,
      nx + f * (NOZZLE_W / 2) * 0.8,
      ny + 2,
      1,
      STREAK,
      {
        cap: 'butt',
        dash: [6, 10],
        dashOffset: now / 12,
        blend: 'add',
      },
    );
  }
}

/**
 * The rope from (tieX, tieY), the canister with a window showing how full it is (0 to 1),
 * the hose and the nozzle.
 */
function drawVacuum(
  gfx: Gfx,
  tieX: number,
  tieY: number,
  pose: VacuumPose,
  fullness: number,
): void {
  const { cx, cy, nx, ny } = pose;
  // Rope.
  gfx.line(tieX, tieY, cx, cy - BODY_H / 2, 1, 'rgba(255, 255, 255, 0.6)');
  // Hose: a curve from the canister's underside to the nozzle.
  gfx.polyline(
    bezierPoints(cx, cy + BODY_H / 2 - 2, cx - 9, cy + NOZZLE_DROP * 0.6, nx, ny - 2, 12),
    3,
    '#64748b',
  );
  // Canister body with a window showing how full it is.
  gfx.rect(cx - BODY_W / 2, cy - BODY_H / 2, BODY_W, BODY_H, '#cbd5e1', {
    radius: BODY_H / 2,
    stroke: { width: 1.5, color: '#475569' },
  });
  const winW = BODY_W * 0.45;
  const winH = BODY_H * 0.55;
  const winX = cx - winW / 2 + 2;
  const winY = cy - winH / 2;
  gfx.rect(winX, winY, winW, winH, '#1e293b');
  const level = winH * Math.min(1, fullness);
  gfx.rect(winX, winY + winH - level, winW, level, '#fb7185');
  if (level > 0)
    gfx.glow(winX + winW / 2, winY + winH - level / 2, 9, '#fb7185', { intensity: 0.6 });
  // A shine along the top of the canister.
  gfx.rect(cx - BODY_W / 2 + 4, cy - BODY_H / 2 + 1.5, BODY_W - 8, 1.6, '#ffffff', {
    radius: 0.8,
    alpha: 0.7,
  });
  // Exhaust at the back, where extras come out.
  gfx.rect(cx - BODY_W / 2 - 3, cy - 2, 4, 4, '#475569');
  // Nozzle.
  gfx.polygon(
    [nx - 3, ny - 5, nx + 3, ny - 5, nx + NOZZLE_W / 2, ny, nx - NOZZLE_W / 2, ny],
    '#334155',
  );
}

/** The vacuum as a craft's intake: icons are sucked into the nozzle and spat out of the exhaust. */
export class Vacuum implements Intake {
  readonly reach = TIE_TO_NOZZLE;

  openings(tieX: number, tieY: number, t: number): Openings {
    const { nx, ny, exhaustX, exhaustY } = vacuumAt(tieX, tieY, t);
    return { inX: nx, inY: ny, outX: exhaustX, outY: exhaustY };
  }

  draw(gfx: Gfx, tieX: number, tieY: number, t: number, fullness: number): void {
    const pose = vacuumAt(tieX, tieY, t);
    drawSuction(gfx, pose, t);
    drawVacuum(gfx, tieX, tieY, pose, fullness);
  }
}
