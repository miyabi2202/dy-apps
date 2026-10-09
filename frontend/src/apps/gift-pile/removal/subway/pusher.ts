import type { Gfx, Point, SpriteSource } from '../board';

// The platform pusher, seen from the side: a station attendant in a navy uniform and peaked cap,
// with white gloves. His body and head are painted once with Canvas2D, in two moods (straining,
// and pleased with himself); his legs and arms are drawn over and under it each frame with plain
// `Gfx` calls, so he can lean, shove, brace his back against the door and bow. Everything is in
// his own frame, facing right, with its origin between his feet, y down; drawn facing left, it is
// mirrored.

const NAVY = '#1d2b4f';
const NAVY_DARK = '#131d38';
const TROUSERS = '#18213b';
const SKIN = '#f3c9a4';
const GOLD = '#e9b949';
const GLOVE = '#ffffff';

/** The painted part, and where his hip is in it. */
const WIDTH = 38;
const HEIGHT = 48;
const HIP_X = 14;
const HIP_Y = 43;

/** His hip at rest, above his feet; his shoulder, from the hip; and how long his arm's and leg's two halves are. */
const HIP: Point = { x: 0, y: -25 };
const SHOULDER: Point = { x: 3, y: -18 };
const UPPER_ARM = 9.5;
const FOREARM = 9.5;
const THIGH = 13;
const SHIN = 13.2;
/** Where his forehead is, from the hip, for wiping his brow. */
export const BROW: Point = { x: 8, y: -31 };

/** How he stands: which way he faces, how far he leans, his hip, his feet, and where his hands are. */
export interface PusherPose {
  facing: 1 | -1;
  /** Radians forward at the hip (negative leans back). */
  lean: number;
  /** His hip, moved from where it is at rest. */
  hipX: number;
  hipY: number;
  /** Each foot, in his frame: back foot then front. */
  feet: readonly [Point, Point];
  /** His near and far hands, in the frame of his leaning body, from the hip. */
  near: Point;
  far: Point;
  happy: boolean;
}

/** Standing to attention, hands behind his back. */
export function standing(): PusherPose {
  return {
    facing: 1,
    lean: 0,
    hipX: 0,
    hipY: 0,
    feet: [
      { x: -4, y: 0 },
      { x: 4, y: 0 },
    ],
    near: { x: -5, y: -7 },
    far: { x: -3, y: -7 },
    happy: false,
  };
}

/** Pointing at the train as it comes in, the far hand on his hip; `u` is how far his arm is up, 0 to 1. */
export function pointing(u: number): PusherPose {
  const rest = standing();
  return {
    ...rest,
    near: lerpPoint(rest.near, { x: 21, y: -23 }, u),
    far: lerpPoint(rest.far, { x: -2, y: -4 }, u),
  };
}

/** Shoving the crowd into the door with both hands; `push` is how far his arms are out, 0 to 1, and `reach` how far forward the crowd is. */
export function shoving(push: number, reach: number): PusherPose {
  return {
    facing: 1,
    lean: 0.3 + 0.18 * push,
    hipX: 1.5 * push,
    hipY: 1.5,
    feet: [
      { x: -12 - 2 * push, y: 0 },
      { x: 6, y: 0 },
    ],
    near: { x: reach + 6 * push, y: -15 },
    far: { x: reach - 1 + 6 * push, y: -11 },
    happy: false,
  };
}

/** Turned round with his back against the door, heaving, his heels dug in; `strain` 0 to 1. */
export function bracing(strain: number, shiver: number): PusherPose {
  return {
    facing: -1,
    lean: -0.32 - 0.16 * strain + shiver * 0.03,
    hipX: -9 - 3 * strain,
    hipY: 2 + strain,
    feet: [
      { x: 2, y: 0 },
      { x: 14 + 2 * strain, y: 0 },
    ],
    near: { x: -9, y: -27 - 2 * strain },
    far: { x: -11, y: -13 },
    happy: false,
  };
}

/** Wiping his brow with the back of his glove, the other hand on his hip; `u` goes 0 to 1 across. */
export function wiping(u: number): PusherPose {
  const rest = standing();
  const swipe = Math.sin(Math.PI * Math.min(1, u * 1.4));
  return {
    ...rest,
    lean: -0.06,
    near: { x: BROW.x + 4 - 12 * swipe, y: BROW.y + 2 },
    far: { x: -2, y: -4 },
    happy: u > 0.5,
  };
}

/** Bowing to the departing train, `u` 0 (upright) to 1 (deep). */
export function bowing(u: number): PusherPose {
  const rest = standing();
  return {
    ...rest,
    lean: 0.85 * u,
    hipX: -2 * u,
    near: { x: 3 + 2 * u, y: -4 },
    far: { x: 2 + 2 * u, y: -4 },
    happy: true,
  };
}

/** His body and head, straining. */
export const PUSHER: SpriteSource = {
  key: 'subway/pusher',
  width: WIDTH,
  height: HEIGHT,
  paint: (ctx) => paintBody(ctx, false),
};

/** His body and head, pleased with a job well done. */
export const PUSHER_HAPPY: SpriteSource = {
  key: 'subway/pusher-happy',
  width: WIDTH,
  height: HEIGHT,
  paint: (ctx) => paintBody(ctx, true),
};

/** His jacket, collar and tie, and his head; with the hip at the origin. */
function paintBody(ctx: CanvasRenderingContext2D, happy: boolean): void {
  ctx.translate(HIP_X, HIP_Y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The jacket, cut square at the shoulders, its tails over his hip.
  const jacket = ctx.createLinearGradient(-6, -20, 10, 2);
  jacket.addColorStop(0, '#2c3d68');
  jacket.addColorStop(0.5, NAVY);
  jacket.addColorStop(1, NAVY_DARK);
  ctx.fillStyle = jacket;
  ctx.beginPath();
  ctx.moveTo(-6.5, 3);
  ctx.quadraticCurveTo(-8, -10, -5, -19);
  ctx.quadraticCurveTo(1, -22, 7.5, -19.5);
  ctx.quadraticCurveTo(10, -9, 8.5, 3);
  ctx.closePath();
  ctx.fill();
  // His neck, collar and a red tie down the front.
  ctx.fillStyle = SKIN;
  ctx.fillRect(1.5, -23, 4, 4);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(1.5, -20.5);
  ctx.lineTo(8, -20);
  ctx.lineTo(6, -15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c62828';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(6.4, -19.4);
  ctx.lineTo(7.4, -12);
  ctx.stroke();
  // Brass buttons, and his belt.
  ctx.fillStyle = GOLD;
  for (const y of [-12, -7, -2]) {
    ctx.beginPath();
    ctx.arc(7.6, y, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#0b1022';
  ctx.fillRect(-7, -1, 15.8, 1.6);
  paintHead(ctx, 4.5, -29, 1, happy);
}

/**
 * His head at (x, y), `scale` times its size, facing right, under a peaked cap with a gold band
 * and badge; straining (brow down, teeth gritted) or `happy` (eyes shut, beaming).
 */
export function paintHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  happy: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The face, round and lit from the front, with a nose and an ear.
  const face = ctx.createRadialGradient(3, 0, 1, 0, 1, 9);
  face.addColorStop(0, '#ffe2c8');
  face.addColorStop(0.7, SKIN);
  face.addColorStop(1, '#d9a07c');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(0, 1, 7, 7.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(6.2, -0.5);
  ctx.quadraticCurveTo(10, 2.2, 6.6, 3.2);
  ctx.fill();
  ctx.fillStyle = '#dca17e';
  ctx.beginPath();
  ctx.ellipse(-2.6, 1.6, 1.6, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Short dark hair under the cap at the back.
  ctx.fillStyle = '#1b1512';
  ctx.beginPath();
  ctx.moveTo(-6.8, -2.5);
  ctx.quadraticCurveTo(-7.6, 2, -5.4, 4.2);
  ctx.lineTo(-4.2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2a1d17';
  ctx.fillStyle = '#2a1d17';
  if (happy) {
    // Eyes shut in a beam, rosy cheeks and a wide smile.
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(4.4, 0.6, 1.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 110, 110, 0.45)';
    ctx.beginPath();
    ctx.arc(3.2, 3.6, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a3a2c';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(5.2, 3.8, 2, 0.2, Math.PI * 0.75);
    ctx.stroke();
  } else {
    // Brow down, eye fixed on the job, teeth gritted.
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2.6, -1.8);
    ctx.lineTo(6.2, -0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4.8, 0.9, 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#6b2a20';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.rect(3.6, 3.9, 3.4, 1.6);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3.6, 4.7);
    ctx.lineTo(7, 4.7);
    ctx.moveTo(5.3, 3.9);
    ctx.lineTo(5.3, 5.5);
    ctx.stroke();
  }
  // The cap: its crown, gold band and badge, and a black peak out over his eyes.
  const crown = ctx.createLinearGradient(0, -9, 0, -3);
  crown.addColorStop(0, '#2f4274');
  crown.addColorStop(1, NAVY_DARK);
  ctx.fillStyle = crown;
  ctx.beginPath();
  ctx.moveTo(-7.4, -2.6);
  ctx.lineTo(-7.8, -7.6);
  ctx.quadraticCurveTo(0, -11, 8.6, -7.8);
  ctx.lineTo(7, -2.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(-7.4, -4.4);
  ctx.lineTo(7.4, -4.6);
  ctx.lineTo(7.1, -3.2);
  ctx.lineTo(-7.4, -3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(5, -6.8, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0d0f14';
  ctx.beginPath();
  ctx.moveTo(5, -3.2);
  ctx.quadraticCurveTo(10, -3.4, 12.4, -1.8);
  ctx.quadraticCurveTo(9, -1.6, 5.4, -2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Partway from `a` to `b`. */
function lerpPoint(a: Point, b: Point, u: number): Point {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** The joint between a limb's two halves, `a` and `b` long, from `from` to `to`; of the two places it could be, the one `pick` likes better. */
function joint(
  from: Point,
  to: Point,
  a: number,
  b: number,
  pick: (p: Point, q: Point) => Point,
): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.min(a + b - 0.01, Math.max(0.01, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const bend = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const p = { x: from.x + Math.cos(base + bend) * a, y: from.y + Math.sin(base + bend) * a };
  const q = { x: from.x + Math.cos(base - bend) * a, y: from.y + Math.sin(base - bend) * a };
  return pick(p, q);
}

/** Where the hand is: as far towards `to` as an arm from the shoulder reaches. */
function reach(to: Point): Point {
  const dx = to.x - SHOULDER.x;
  const dy = to.y - SHOULDER.y;
  const d = Math.hypot(dx, dy);
  const most = UPPER_ARM + FOREARM - 0.2;
  if (d <= most) return to;
  return { x: SHOULDER.x + (dx / d) * most, y: SHOULDER.y + (dy / d) * most };
}

/** One arm, from the shoulder to the hand at `to`, the elbow bent down; `f` mirrors it. */
function drawArm(gfx: Gfx, to: Point, sleeve: string, f: number, alpha: number): void {
  const hand = reach(to);
  const elbow = joint(SHOULDER, hand, UPPER_ARM, FOREARM, (p, q) => (p.y > q.y ? p : q));
  gfx.polyline(
    [f * SHOULDER.x, SHOULDER.y, f * elbow.x, elbow.y, f * hand.x, hand.y],
    5.2,
    sleeve,
    { alpha },
  );
  // A gold cuff, and the white glove.
  const cx = elbow.x + (hand.x - elbow.x) * 0.78;
  const cy = elbow.y + (hand.y - elbow.y) * 0.78;
  gfx.circle(f * cx, cy, 2.5, GOLD, { alpha });
  gfx.circle(f * hand.x, hand.y, 3.3, GLOVE, {
    alpha,
    stroke: { width: 0.7, color: '#9aa3b5' },
  });
}

/** One leg, from the hip to the foot at `foot`, the knee bent forward; `f` mirrors it. */
function drawLeg(gfx: Gfx, hip: Point, foot: Point, color: string, f: number, alpha: number): void {
  const knee = joint(hip, foot, THIGH, SHIN, (p, q) => (p.x > q.x ? p : q));
  gfx.polyline([f * hip.x, hip.y, f * knee.x, knee.y, f * foot.x, foot.y - 2], 6.4, color, {
    alpha,
  });
  gfx.ellipse(f * (foot.x + 2), foot.y - 1.6, 5, 2.4, 0, '#0b0b0e', { alpha });
}

/** Him, between his feet at (x, y), `scale` times his size, faded to `alpha`. */
export function drawPusher(
  gfx: Gfx,
  x: number,
  y: number,
  scale: number,
  pose: PusherPose,
  alpha: number,
): void {
  if (alpha <= 0) return;
  const f = pose.facing;
  const hip = { x: HIP.x + pose.hipX, y: HIP.y + pose.hipY };
  gfx.push(x, y, 0, scale);
  // A soft shadow on the platform.
  gfx.ellipse(f * 2, 0.5, 14, 2.2, 0, '#000000', { alpha: 0.25 * alpha, soft: 2 });
  drawLeg(gfx, hip, pose.feet[0], '#111a31', f, alpha);
  drawLeg(gfx, hip, pose.feet[1], TROUSERS, f, alpha);
  gfx.push(f * hip.x, hip.y, f * pose.lean);
  drawArm(gfx, pose.far, NAVY_DARK, f, alpha);
  gfx.sprite(pose.happy ? PUSHER_HAPPY : PUSHER, {
    x: 0,
    y: 0,
    anchorX: HIP_X / WIDTH,
    anchorY: HIP_Y / HEIGHT,
    flipX: f < 0,
    alpha,
  });
  drawArm(gfx, pose.near, NAVY, f, alpha);
  gfx.pop();
  gfx.pop();
}

/** Where a point of his leaning body (from the hip, facing right) is in the world, for him drawn at (x, y) with `pose`. */
export function bodyToWorld(
  local: Point,
  x: number,
  y: number,
  scale: number,
  pose: PusherPose,
): Point {
  const f = pose.facing;
  const c = Math.cos(pose.lean);
  const s = Math.sin(pose.lean);
  const lx = HIP.x + pose.hipX + local.x * c - local.y * s;
  const ly = HIP.y + pose.hipY + local.x * s + local.y * c;
  return { x: x + f * lx * scale, y: y + ly * scale };
}
