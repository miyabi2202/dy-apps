import type { Course, Craft, Pose, World } from './craft';

/** The car's length, and how far its centre sits above the road. */
const CAR_L = 64;
const CAR_LIFT = 12;
/**
 * The split bridge the car jumps: each half's run, its rise as a share of that, and how far
 * below the left half's top the right half's top is, as a share of the rise, since a car
 * comes down lower than it took off.
 */
const RAMP_RUN_SHARE = 0.28;
const RAMP_RUN_MAX = 150;
const RAMP_RISE_SHARE = 0.5;
const LANDING_DROP_SHARE = 0.6;
/** The bridge fades in and out over this long. */
const FADE_MS = 300;

/**
 * The split bridge for a canvas this wide: each half's horizontal run and rise, the gap
 * between them, how far below the left half's top the right half's top is, and how high
 * above the left top the jump peaks. The jump is the ballistic arc that leaves the left ramp
 * along its slope, so the car's nose follows through smoothly rather than rearing up, and
 * comes down onto the lower right half: `y(s) = -g·gap·s + (drop + g·gap)·s²` over the gap,
 * for grade `g`.
 */
export function bridge(width: number) {
  const run = Math.min(RAMP_RUN_MAX, width * RAMP_RUN_SHARE);
  const rise = run * RAMP_RISE_SHARE;
  const gap = width - 2 * run;
  const drop = rise * LANDING_DROP_SHARE;
  const launch = (rise / run) * gap;
  return { run, rise, gap, drop, apex: (launch * launch) / (4 * (drop + launch)) };
}

/**
 * A hypercar: two bridge halves appear at the sides like / and \, the right one lower; it
 * runs up the left, jumps the gap in an arc and drives off down the right, nose following
 * the way it is going. The quickest craft, though not so quick you miss it.
 */
export class Hypercar implements Craft {
  readonly name = 'car';
  readonly crossMs = 3000;
  /** The rope ties on under the car. */
  readonly tie = { dx: 0, dy: CAR_LIFT };

  /** Room for the jump's peak. */
  minY(world: World): number {
    return bridge(world.width).apex + 24;
  }

  /** It lands this much lower than it took off. */
  sag(world: World): number {
    return bridge(world.width).drop;
  }

  pathAt(course: Course, px: number): Pose {
    const { run, rise, gap, drop } = bridge(course.width);
    const grade = rise / run;
    if (px < run) {
      const s = Math.min(1, Math.max(0, px / run));
      return { py: course.altitude + rise * (1 - s), tilt: px < 0 ? 0 : -Math.atan(grade) };
    }
    const launch = grade * gap;
    if (px <= run + gap) {
      const s = (px - run) / gap;
      const slope = (-launch + 2 * (drop + launch) * s) / gap;
      return { py: course.altitude - launch * s + (drop + launch) * s * s, tilt: Math.atan(slope) };
    }
    // Down the right half, settling from the landing angle onto the ramp's.
    const s = Math.min(1, (px - run - gap) / run);
    const landing = Math.atan((launch + 2 * drop) / gap);
    const settled = Math.min(1, s * 4);
    const tilt = s < 1 ? landing + (Math.atan(grade) - landing) * settled : 0;
    return { py: course.altitude + drop + rise * s, tilt };
  }

  /** The two bridge halves, each a deck with a rail and a torn end at the gap. */
  drawScene(ctx: CanvasRenderingContext2D, course: Course, t: number, remainingMs: number): void {
    const { run, rise, drop } = bridge(course.width);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, t / FADE_MS, remainingMs / FADE_MS));
    ctx.lineCap = 'butt';
    for (const side of [-1, 1]) {
      // From the canvas's edge up to the gap; the right half's top is lower.
      const edgeX = side < 0 ? 0 : course.width;
      const gapX = side < 0 ? run : course.width - run;
      const roadY = course.altitude + CAR_LIFT + (side < 0 ? 0 : drop);
      // Deck.
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(edgeX, roadY + rise);
      ctx.lineTo(gapX, roadY);
      ctx.stroke();
      // Road surface and its centre dashes.
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(edgeX, roadY + rise - 3);
      ctx.lineTo(gapX, roadY - 3);
      ctx.stroke();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(edgeX, roadY + rise - 3);
      ctx.lineTo(gapX, roadY - 3);
      ctx.stroke();
      ctx.setLineDash([]);
      // The torn end of the half at the gap.
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(gapX - 2, roadY - 5, 4, 10);
      // Rail: posts and a top rail along the far side.
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const x = edgeX + ((gapX - edgeX) * i) / 4;
        const y = roadY + rise * (1 - i / 4) - 3;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 10);
      }
      ctx.moveTo(edgeX, roadY + rise - 13);
      ctx.lineTo(gapX, roadY - 13);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A low, wedge-shaped car facing right, its wheels on the road `CAR_LIFT` below its centre. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number): void {
    const l = CAR_L;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // Body.
    ctx.fillStyle = '#f43f5e';
    ctx.strokeStyle = '#881337';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-l / 2, 6);
    ctx.lineTo(-l / 2 + 2, -4);
    ctx.lineTo(-l / 4, -5);
    ctx.lineTo(-l / 8, -14);
    ctx.lineTo(l / 6, -14);
    ctx.lineTo(l / 3, -6);
    ctx.lineTo(l / 2 - 2, -2);
    ctx.lineTo(l / 2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Rear wing.
    ctx.fillStyle = '#881337';
    ctx.fillRect(-l / 2 - 4, -11, 12, 2.5);
    ctx.fillRect(-l / 2 + 2, -9, 2, 5);
    // Windows.
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(-l / 4 + 3, -5);
    ctx.lineTo(-l / 8 + 2, -12);
    ctx.lineTo(l / 6 - 2, -12);
    ctx.lineTo(l / 3 - 4, -6);
    ctx.closePath();
    ctx.fill();
    // Lights.
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(l / 2 - 7, -2, 6, 2);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-l / 2, -3, 3, 2);
    // Wheels.
    for (const wx of [-l / 3, l / 3]) {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(wx, CAR_LIFT - 6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(wx, CAR_LIFT - 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
