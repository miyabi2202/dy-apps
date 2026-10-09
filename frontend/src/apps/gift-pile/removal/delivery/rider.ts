import type { Gfx, Point, SpriteSource } from '../board';
import type { DeliveryScheme } from './scooter';

// The delivery rider, seen from the side and facing right: helmet, jacket with reflective
// stripes, and the trousers and trainers of a man who is always late. His body and head are
// painted once with Canvas2D (`riderSprite`); his arms, legs and mouth are drawn over it each
// frame with plain `Gfx` calls, so he can grip the bars, stamp and toss in a frenzy, and shout.
// Everything here is in his own frame, in world pixels, with its origin at his hip, y down.

const SKIN = '#f1c7a1';
const TROUSERS = '#2c3440';
const SHOES = '#16181c';

/** The painted part, and where his hip is in it. */
const WIDTH = 40;
const HEIGHT = 54;
const HIP_X = 15;
const HIP_Y = 48;

/** Where his shoulder and mouth are, before he leans; how long his limbs are. */
const SHOULDER: Point = { x: 2, y: -20 };
const MOUTH: Point = { x: 11.2, y: -25.5 };
const HEAD: Point = { x: 4, y: -31 };
const THIGH = 15;
const SHIN = 15;
const UPPER_ARM = 11;
const FOREARM = 11;
/** How high his hip is when he stands. */
export const STAND_HIP = 28;

/**
 * How he holds himself: how far his body leans forward (radians, clockwise), and where his
 * hands and feet are from his hip, unleaned. The near ones are on our side of him.
 */
export interface Pose {
  lean: number;
  nearHand: Point;
  farHand: Point;
  nearFoot: Point;
  farFoot: Point;
}

/** His body and head, painted once in a scheme's colours. */
export function riderSprite(scheme: DeliveryScheme): SpriteSource {
  return {
    key: `delivery/rider/${scheme.main}`,
    width: WIDTH,
    height: HEIGHT,
    paint(ctx) {
      ctx.translate(HIP_X, HIP_Y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // The jacket, padded, a little longer at the back, with its stripes.
      const jacket = ctx.createLinearGradient(-8, 0, 10, 0);
      jacket.addColorStop(0, scheme.deep);
      jacket.addColorStop(0.45, scheme.main);
      jacket.addColorStop(1, scheme.deep);
      ctx.fillStyle = jacket;
      ctx.beginPath();
      ctx.moveTo(-7, 2);
      ctx.quadraticCurveTo(-9, -12, -4, -22);
      ctx.lineTo(8, -23);
      ctx.quadraticCurveTo(11, -12, 9, 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e4e8ee';
      ctx.fillRect(-8.2, -10, 17.4, 2.4);
      ctx.fillRect(-7.4, -4, 16.4, 2.4);
      ctx.fillStyle = scheme.trim;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(5, -21, 1.2, 22);
      ctx.globalAlpha = 1;
      // The collar.
      ctx.fillStyle = scheme.deep;
      ctx.beginPath();
      ctx.ellipse(3, -22.5, 6.5, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      paintHead(ctx, HEAD.x, HEAD.y, 1, scheme);
    },
  };
}

/**
 * His head at (x, y), `scale` times its size, facing right, in his helmet with its visor up.
 * The mouth is left off: it is drawn each frame, shut or shouting.
 */
export function paintHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  scheme: DeliveryScheme,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The face, and a nose.
  const face = ctx.createRadialGradient(5, 1, 1, 3, 1, 9);
  face.addColorStop(0, '#ffe2c8');
  face.addColorStop(0.7, SKIN);
  face.addColorStop(1, '#d29d78');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(3, 1.5, 7.4, 7.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(9.6, -0.5);
  ctx.quadraticCurveTo(12.4, 2.6, 9.6, 3.4);
  ctx.fill();
  // The helmet: a round shell over the top and back, with a chin strap.
  const shell = ctx.createLinearGradient(0, -10, 0, 4);
  shell.addColorStop(0, scheme.light);
  shell.addColorStop(0.3, scheme.main);
  shell.addColorStop(1, scheme.deep);
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.moveTo(-7, 5);
  ctx.quadraticCurveTo(-9.5, -9.5, 3, -10.2);
  ctx.quadraticCurveTo(11.6, -9.6, 11, -2.4);
  ctx.lineTo(5.5, -2.6);
  ctx.quadraticCurveTo(1, -2.4, -0.5, 1.6);
  ctx.lineTo(-1, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-4.5, -5);
  ctx.quadraticCurveTo(-2, -8.5, 3, -8.6);
  ctx.stroke();
  ctx.strokeStyle = '#2b2f36';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-0.6, 3);
  ctx.quadraticCurveTo(2, 8.5, 6, 8.2);
  ctx.stroke();
  // The visor, tinted and pushed up.
  ctx.fillStyle = 'rgba(40, 60, 80, 0.85)';
  ctx.beginPath();
  ctx.moveTo(3, -10.6);
  ctx.quadraticCurveTo(12.5, -10.6, 13, -4.6);
  ctx.lineTo(10.6, -3.6);
  ctx.quadraticCurveTo(10, -8.4, 3, -8.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(190, 230, 255, 0.8)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(5, -9.7);
  ctx.quadraticCurveTo(10.5, -9.6, 11.8, -6);
  ctx.stroke();
  // A wide, worried eye and an eyebrow raised high.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(7.4, 0, 2, 2.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1b1f';
  ctx.beginPath();
  ctx.arc(8.2, 0.2, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2618';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(5.6, -2.9);
  ctx.quadraticCurveTo(7.6, -3.9, 9.6, -2.8);
  ctx.stroke();
  ctx.restore();
}

/** How he is to be drawn this frame. */
export interface RiderLook {
  pose: Pose;
  /** How wide his mouth is open, 0 (shut) to 1 (shouting). */
  mouth: number;
}

/** The rider with his hip at (x, y), his whole frame turned by `turn` (the scooter's tilt, when he is on it). */
export function drawRider(
  gfx: Gfx,
  sprite: SpriteSource,
  scheme: DeliveryScheme,
  x: number,
  y: number,
  turn: number,
  { pose, mouth }: RiderLook,
): void {
  gfx.push(x, y, turn);
  const shoulder = lean(SHOULDER, pose.lean);
  // His far leg and arm, in shadow behind him.
  drawLeg(gfx, pose.farFoot, '#20262f', -1);
  drawArm(gfx, shoulder, pose.farHand, scheme.deep, '#d9ab86');
  // His body and head.
  gfx.push(0, 0, pose.lean);
  gfx.sprite(sprite, { x: 0, y: 0, anchorX: HIP_X / WIDTH, anchorY: HIP_Y / HEIGHT });
  if (mouth > 0.05) {
    gfx.ellipse(MOUTH.x, MOUTH.y, 1.6 + mouth * 0.8, 0.8 + mouth * 1.8, 0, '#5a1e1e');
    gfx.ellipse(MOUTH.x, MOUTH.y + 0.6 * mouth, 1.2, 0.6 * mouth, 0, '#e86b6b');
  } else {
    gfx.line(MOUTH.x - 1.4, MOUTH.y, MOUTH.x + 1, MOUTH.y + 0.4, 0.9, '#8a4a3a');
  }
  gfx.pop();
  // His near leg and arm.
  drawLeg(gfx, pose.nearFoot, TROUSERS, 1);
  drawArm(gfx, shoulder, pose.nearHand, scheme.main, SKIN);
  gfx.pop();
}

/** Where the top of his helmet is, from his hip, leaning by `by`: for his sweat and his shout. */
export function headTop(by: number): Point {
  return lean({ x: HEAD.x + 3, y: HEAD.y - 10 }, by);
}

/** A leg from his hip to `foot`, the knee bent forward, and its trainer. */
function drawLeg(gfx: Gfx, foot: Point, color: string, side: number): void {
  const hip = { x: side * 0.5, y: -1 };
  const knee = joint(hip, foot, THIGH, SHIN, -1);
  gfx.polyline([hip.x, hip.y, knee.x, knee.y, foot.x, foot.y], 6.5, color);
  gfx.ellipse(foot.x + 2.5, foot.y + 1, 4.6, 2.4, 0, SHOES);
  gfx.rect(foot.x - 1.5, foot.y + 2.4, 8.6, 1.2, '#e9edf2', { radius: 0.6 });
}

/** An arm from `shoulder` to `hand`, the elbow bent back, in its sleeve. */
function drawArm(gfx: Gfx, shoulder: Point, hand: Point, sleeve: string, skin: string): void {
  const elbow = joint(shoulder, hand, UPPER_ARM, FOREARM, 1);
  gfx.polyline([shoulder.x, shoulder.y, elbow.x, elbow.y, hand.x, hand.y], 5.6, sleeve);
  gfx.circle(hand.x, hand.y, 2.9, skin);
}

/** The joint of a limb from `root` towards `end`, its two parts `a` and `b` long, bent to one side (`bend` ±1). */
function joint(root: Point, end: Point, a: number, b: number, bend: number): Point {
  const dx = end.x - root.x;
  const dy = end.y - root.y;
  const d = Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const off = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const angle = base + bend * off;
  return { x: root.x + Math.cos(angle) * a, y: root.y + Math.sin(angle) * a };
}

/** A point of his body turned about his hip by `by`. */
function lean(p: Point, by: number): Point {
  const c = Math.cos(by);
  const s = Math.sin(by);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Partway from pose `a` to `b`. */
export function blendPose(a: Pose, b: Pose, u: number): Pose {
  const mix = (p: Point, q: Point) => ({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u });
  return {
    lean: a.lean + (b.lean - a.lean) * u,
    nearHand: mix(a.nearHand, b.nearHand),
    farHand: mix(a.farHand, b.farHand),
    nearFoot: mix(a.nearFoot, b.nearFoot),
    farFoot: mix(a.farFoot, b.farFoot),
  };
}

/**
 * The shout: a spiky white bubble with a big tick and an exclamation mark in it, its tail at
 * (x, y) and the bubble up and to the right of it, `scale` times its size.
 */
export function drawShout(gfx: Gfx, x: number, y: number, scale: number, alpha: number): void {
  if (scale <= 0.01 || alpha <= 0) return;
  gfx.push(x, y, 0, scale);
  const cx = 26;
  const cy = -30;
  // A burst of spikes round the bubble, for a shout rather than a word.
  const spikes: number[] = [];
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const r = k % 2 === 0 ? 1.28 : 1;
    spikes.push(cx + Math.cos(a) * 25 * r, cy + Math.sin(a) * 17 * r);
  }
  gfx.polygon(spikes, '#1f2228', { alpha });
  gfx.polygon([2, 0, 14, -20, 24, -16], '#1f2228', { alpha });
  const inner = spikes.map((v, k) => (k % 2 === 0 ? cx + (v - cx) * 0.9 : cy + (v - cy) * 0.88));
  gfx.polygon(inner, '#ffffff', { alpha });
  gfx.polygon([4.5, -3, 15, -19, 22, -16.5], '#ffffff', { alpha });
  // The tick, and the exclamation mark.
  gfx.polyline([12, -31, 19, -23, 32, -40], 5, '#22b45a', { alpha });
  gfx.line(39, -42, 39, -28, 4.2, '#e23b3b', { alpha });
  gfx.circle(39, -21.5, 2.4, '#e23b3b', { alpha });
  gfx.pop();
}
