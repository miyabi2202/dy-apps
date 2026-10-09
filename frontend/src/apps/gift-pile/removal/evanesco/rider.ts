import type { Gfx, Point, SpriteSource } from '../board';

// The wizard on his broom, seen from the side and facing right. His body and the broom are painted
// once with Canvas2D (`RIDER`); what moves is drawn over it each frame with plain `Gfx` calls:
// the wand arm, the scarf's tails streaming behind him and his robe flapping. Everything here is
// in his own frame, in world pixels, with its origin at his hip, y down.

/** Scarlet and gold, for his scarf. */
export const SCARLET = '#ae0001';
export const GOLD = '#eeba30';
const ROBE = '#15121b';
const ROBE_LINING = '#5c0b14';
const SKIN = '#f2c9a7';
const HAIR = '#16110f';
const WAND = '#5b3a23';

/** The painted part, and where his hip is in it. */
const WIDTH = 132;
const HEIGHT = 88;
const HIP_X = 76;
const HIP_Y = 54;

/** His wand arm: the shoulder it swings from, how long it is, and how long the wand is. */
export const SHOULDER: Point = { x: 9, y: -27 };
const ARM = 18;
const WAND_LENGTH = 17;
/** Where his scarf is knotted, and where the broom's bristles end (for the sparkles off them). */
const NECK: Point = { x: 12, y: -31 };
export const BRISTLES: Point = { x: -72, y: 7 };

/** How his wand arm is held: the arm's angle from the shoulder and the wand's, in radians clockwise from straight ahead. */
export interface Pose {
  arm: number;
  wand: number;
}

/** Flying, the wand held forward and a little down. */
export const IDLE: Pose = { arm: 0.6, wand: 0.15 };
/** Wound up to cast, the wand raised up and back over his head. */
export const WOUND_UP: Pose = { arm: -2.25, wand: -2.0 };

/** Body and broom, painted once. */
export const RIDER: SpriteSource = {
  key: 'evanesco/rider',
  width: WIDTH,
  height: HEIGHT,
  paint(ctx) {
    ctx.translate(HIP_X, HIP_Y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paintFarArm(ctx);
    paintBroom(ctx);
    paintBody(ctx);
    paintHead(ctx, 17, -40, 1);
  },
};

/** His other arm, behind him, its hand on the broom handle ahead of him. */
function paintFarArm(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#0d0b11';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(7, -25);
  ctx.quadraticCurveTo(20, -14, 27, 1);
  ctx.stroke();
  ctx.fillStyle = '#e0b493';
  ctx.beginPath();
  ctx.arc(27, 2, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** A racing broom: a polished handle, a gold band, and a tail of twigs bound tight. */
function paintBroom(ctx: CanvasRenderingContext2D): void {
  // The twigs, fanning out behind, each a slightly different brown.
  const twigs = ['#8a5a2b', '#a8743a', '#6f4520', '#c08a48', '#7c5026'];
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 26; k++) {
    const u = k / 25;
    ctx.strokeStyle = twigs[k % twigs.length]!;
    ctx.beginPath();
    ctx.moveTo(-44, 6 + (u - 0.5) * 3);
    ctx.quadraticCurveTo(-58, 6 + (u - 0.5) * 9, -72 - Math.sin(k * 2.3) * 3, 7 + (u - 0.5) * 17);
    ctx.stroke();
  }
  // The bindings round the twigs.
  ctx.strokeStyle = '#3b2412';
  ctx.lineWidth = 2;
  for (const x of [-46, -50]) {
    ctx.beginPath();
    ctx.moveTo(x, 2.5);
    ctx.lineTo(x - 0.6, 9.5);
    ctx.stroke();
  }
  // The handle, mahogany with a shine along its top.
  const wood = ctx.createLinearGradient(0, 1, 0, 8);
  wood.addColorStop(0, '#c98a52');
  wood.addColorStop(0.35, '#7a3f1d');
  wood.addColorStop(1, '#3d1c0b');
  ctx.strokeStyle = wood;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-46, 6);
  ctx.lineTo(54, 1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 230, 190, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-40, 4.6);
  ctx.lineTo(52, 0);
  ctx.stroke();
  // A gold band near its tip, and the stirrup under him.
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4.4;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(42, 1.6);
  ctx.lineTo(46, 1.4);
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#a7a9b0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(4, 5);
  ctx.lineTo(9, 19);
  ctx.lineTo(15, 19);
  ctx.stroke();
}

/** His legs, his robe over his body, and the scarf round his neck. */
function paintBody(ctx: CanvasRenderingContext2D): void {
  // The near leg, bent at the knee, its foot in the stirrup.
  ctx.strokeStyle = '#2b2a33';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(16, 4);
  ctx.lineTo(11, 17);
  ctx.stroke();
  ctx.fillStyle = '#0c0b0e';
  ctx.beginPath();
  ctx.ellipse(13.5, 19, 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // The robe, leaning into the flight, with a sheen down his back and its lining at the front.
  const robe = ctx.createLinearGradient(-6, -30, 18, 6);
  robe.addColorStop(0, '#3a3346');
  robe.addColorStop(0.3, ROBE);
  robe.addColorStop(1, '#09080c');
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.quadraticCurveTo(-6, -18, 3, -29);
  ctx.lineTo(13, -31);
  ctx.quadraticCurveTo(20, -22, 15, -8);
  ctx.quadraticCurveTo(18, 2, 20, 6);
  ctx.lineTo(4, 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ROBE_LINING;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(14, -27);
  ctx.quadraticCurveTo(18, -18, 14.5, -8);
  ctx.stroke();
  // The house crest on his chest, a little shield.
  ctx.fillStyle = SCARLET;
  ctx.beginPath();
  ctx.moveTo(9, -21);
  ctx.lineTo(14, -21);
  ctx.lineTo(14, -17);
  ctx.lineTo(11.5, -14.5);
  ctx.lineTo(9, -17);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // The scarf, wound round his neck in stripes.
  paintScarfWrap(ctx, NECK.x, NECK.y, 1);
}

/** The scarf wound round a neck at (x, y), `scale` times its size. */
function paintScarfWrap(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.5, 4, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = SCARLET;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.6;
  for (const sx of [-4, 0, 4]) {
    ctx.beginPath();
    ctx.moveTo(sx - 2, -5);
    ctx.lineTo(sx + 2, 5);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * His head at (x, y), `scale` times its size, facing right: messy black hair, round glasses,
 * the lightning-bolt scar on his forehead.
 */
export function paintHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // The face, lit from the front.
  const face = ctx.createRadialGradient(3, -1, 1, 0, 0, 10);
  face.addColorStop(0, '#ffe0c6');
  face.addColorStop(0.7, SKIN);
  face.addColorStop(1, '#d39f7c');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.6, 9.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // The nose and the ear.
  ctx.beginPath();
  ctx.moveTo(7.8, -1.5);
  ctx.quadraticCurveTo(11, 2, 8, 2.6);
  ctx.fill();
  ctx.fillStyle = '#d9a583';
  ctx.beginPath();
  ctx.ellipse(-2.5, 0.5, 2, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hair, black and every which way, over the top and the back.
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-8.5, 4);
  ctx.lineTo(-11, 1);
  ctx.lineTo(-9, -1);
  ctx.lineTo(-12, -5);
  ctx.lineTo(-8, -6);
  ctx.lineTo(-9, -11);
  ctx.lineTo(-4, -9.5);
  ctx.lineTo(-3, -13.5);
  ctx.lineTo(1, -10.5);
  ctx.lineTo(4, -13);
  ctx.lineTo(5.5, -9);
  ctx.lineTo(9.5, -10);
  ctx.lineTo(8.5, -6.5);
  ctx.lineTo(10.5, -5);
  ctx.lineTo(6, -4.6);
  ctx.lineTo(4.5, -6.2);
  ctx.lineTo(2.5, -4.4);
  ctx.lineTo(-1, -5);
  ctx.lineTo(-2, -2);
  ctx.lineTo(-5, -3);
  ctx.lineTo(-5.5, 3);
  ctx.closePath();
  ctx.fill();
  // The scar, a little lightning bolt under his fringe.
  ctx.strokeStyle = '#b5413a';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(4.8, -4.2);
  ctx.lineTo(3.6, -2.6);
  ctx.lineTo(5, -2.4);
  ctx.lineTo(3.8, -0.8);
  ctx.stroke();
  // The eye behind round glasses, and their arm back to his ear.
  ctx.fillStyle = '#2f6b3a';
  ctx.beginPath();
  ctx.arc(5.6, 0.2, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1b1b1f';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(5.4, 0.3, 3.1, 0, Math.PI * 2);
  ctx.moveTo(2.3, 0);
  ctx.lineTo(-2, -0.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(5.4, 0.3, 2.2, -2.4, -1.5);
  ctx.stroke();
  // The mouth, set with concentration.
  ctx.strokeStyle = '#9a5a48';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(6.2, 5);
  ctx.lineTo(8, 4.7);
  ctx.stroke();
  ctx.restore();
}

/** Where a point of his own frame is in the world, with him at (x, y) tipped by `tilt`. */
export function toWorld(local: Point, x: number, y: number, tilt: number): Point {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return { x: x + local.x * c - local.y * s, y: y + local.x * s + local.y * c };
}

/** Where his hand and the tip of his wand are in his own frame, held as `pose` says. */
export function wandOf(pose: Pose): { hand: Point; tip: Point } {
  const hand = {
    x: SHOULDER.x + Math.cos(pose.arm) * ARM,
    y: SHOULDER.y + Math.sin(pose.arm) * ARM,
  };
  return {
    hand,
    tip: {
      x: hand.x + Math.cos(pose.wand) * WAND_LENGTH,
      y: hand.y + Math.sin(pose.wand) * WAND_LENGTH,
    },
  };
}

/** How he is to be drawn this frame. */
export interface RiderLook {
  tilt: number;
  pose: Pose;
  /** How fast he is going, 0 (hovering) to 1 (flat out): his scarf and robe stream behind him with it. */
  speed: number;
  /** The frame's time in ms, for the flapping. */
  t: number;
}

/** The wizard with his hip at (x, y). */
export function drawRider(
  gfx: Gfx,
  x: number,
  y: number,
  { tilt, pose, speed, t }: RiderLook,
): void {
  gfx.push(x, y, tilt);
  drawRobeTail(gfx, speed, t);
  drawScarfTails(gfx, speed, t);
  gfx.sprite(RIDER, { x: 0, y: 0, anchorX: HIP_X / WIDTH, anchorY: HIP_Y / HEIGHT });
  // The wand arm, over everything: sleeve, hand and wand.
  const { hand, tip } = wandOf(pose);
  gfx.line(SHOULDER.x, SHOULDER.y, hand.x, hand.y, 6.5, ROBE);
  gfx.line(SHOULDER.x, SHOULDER.y, hand.x, hand.y, 1.2, '#3a3346', { alpha: 0.7 });
  gfx.line(hand.x, hand.y, tip.x, tip.y, 1.8, WAND);
  gfx.circle(hand.x, hand.y, 3.1, SKIN);
  gfx.pop();
}

/** The tail of his robe, flapping out behind his back, longer the faster he goes. */
function drawRobeTail(gfx: Gfx, speed: number, t: number): void {
  const reach = 0.55 + 0.45 * speed;
  const flap = (k: number) => Math.sin(t * 0.016 - k * 1.1) * (1.5 + 3.5 * speed) * k * 0.5;
  const shape = (drop: number) => [
    1,
    -26,
    -7,
    -2 + drop,
    -20 * reach,
    1 + drop + flap(1),
    -36 * reach,
    -3 + drop + flap(2) + (1 - speed) * 10,
    -27 * reach,
    -13 + flap(1.6) + (1 - speed) * 6,
    -11 * reach,
    -21 + flap(0.8),
  ];
  // The lining peeps out under the hem.
  gfx.polygon(shape(2), ROBE_LINING);
  gfx.polygon(shape(0), ROBE);
}

/** The two tails of his scarf, streaming back from his neck when he flies and hanging when he hovers. */
function drawScarfTails(gfx: Gfx, speed: number, t: number): void {
  // Straight back when flying, down and back when still.
  const angle = Math.PI - 0.12 - (1 - speed) * 1.05;
  for (const [length, phase] of [
    [8, 0],
    [6, 1.9],
  ] as const) {
    const points: number[] = [NECK.x - 3, NECK.y + 1];
    let px = NECK.x - 3;
    let py = NECK.y + 1;
    for (let k = 1; k <= length; k++) {
      const wave = Math.sin(t * 0.017 - k * 0.8 + phase) * (0.18 + 0.32 * speed);
      px += Math.cos(angle + wave) * 4.6;
      py += Math.sin(angle + wave) * 4.6;
      points.push(px, py);
    }
    gfx.polyline(points, 4.6, SCARLET);
    gfx.polyline(points, 4.6, GOLD, { dash: [3, 6], dashOffset: phase * 3, cap: 'butt' });
  }
}
