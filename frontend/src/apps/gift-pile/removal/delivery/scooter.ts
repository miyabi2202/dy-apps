import type { Gfx, Point, SpriteSource } from '../board';

// The electric scooter and its insulated delivery box, seen from the side and facing right. The
// body and the box are painted once each with Canvas2D; the wheels, which spin, are drawn over
// them each frame with plain `Gfx` calls. The box is its own sprite so it can bulge as it is
// stuffed; its lid, which flaps, is forced down and bows under the rope that ties it, is drawn
// each frame, and so is the rope. Everything here is in the scooter's own frame, in world pixels,
// with its origin on the ground halfway between the wheels, y down.

/** The colours of one rider's kit: his scooter, jacket, helmet and box are all in them. No company's. */
export interface DeliveryScheme {
  /** The main colour, its shade and a light for its shine. */
  main: string;
  deep: string;
  light: string;
  /** The trim: the stripes on the jacket and the emblem on the box. */
  trim: string;
}

/** Yellow, the first, and blue. */
export const DELIVERY_SCHEMES: readonly DeliveryScheme[] = [
  { main: '#ffc928', deep: '#d18f00', light: '#fff1b8', trim: '#2b2f36' },
  { main: '#2f8cff', deep: '#1650b8', light: '#bfe0ff', trim: '#ffffff' },
];

/** The wheels: how big, and where their middles are. */
export const WHEEL_R = 10;
export const REAR_WHEEL: Point = { x: -30, y: -WHEEL_R };
export const FRONT_WHEEL: Point = { x: 30, y: -WHEEL_R };
export const WHEELBASE = FRONT_WHEEL.x - REAR_WHEEL.x;
/** Where the rider's hip is on the seat, his feet on the footboard and his hands on the bars. */
export const SEAT: Point = { x: -8, y: -40 };
export const FOOTBOARD: Point = { x: 10, y: -17 };
export const BARS: Point = { x: 25, y: -54 };
/** The box: the middle of its bottom on the rack, and its size. */
export const BOX_FOOT: Point = { x: -37, y: -38 };
export const BOX_W = 42;
export const BOX_H = 34;
/** Its lid: how thick it is, hinged at the box's back edge. */
const LID_H = 5;
/** The rope: its colours, and where its two wraps cross the box's side, as shares of its width from the middle. */
const ROPE = '#d2a35c';
const ROPE_TWIST = '#8c6230';
const ROPE_AT = [-0.3, 0.3] as const;

/** The painted body, and where the scooter's origin is in it. */
const BODY_W = 124;
const BODY_H = 66;
const BODY_X = 62;
const BODY_Y = 60;

/** The scooter's body, everything but the wheels and the box, in a scheme's colours. */
export function scooterSprite(scheme: DeliveryScheme): SpriteSource {
  return {
    key: `delivery/scooter/${scheme.main}`,
    width: BODY_W,
    height: BODY_H,
    paint(ctx) {
      ctx.translate(BODY_X, BODY_Y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const paint = ctx.createLinearGradient(0, -46, 0, -10);
      paint.addColorStop(0, scheme.light);
      paint.addColorStop(0.25, scheme.main);
      paint.addColorStop(1, scheme.deep);
      // The rack the box sits on, and its strut down to the rear axle.
      ctx.strokeStyle = '#5d636e';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-58, -38);
      ctx.lineTo(-18, -38);
      ctx.moveTo(-40, -38);
      ctx.lineTo(-30, -10);
      ctx.stroke();
      // The fork, down to the front axle.
      ctx.strokeStyle = '#8b919c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(24, -44);
      ctx.lineTo(30, -10);
      ctx.stroke();
      // The rear cowl over the back wheel, fat and round as a scooter's is.
      ctx.fillStyle = paint;
      ctx.beginPath();
      ctx.moveTo(-48, -15);
      ctx.quadraticCurveTo(-50, -33, -36, -36);
      ctx.lineTo(-4, -36);
      ctx.quadraticCurveTo(4, -30, 0, -20);
      ctx.lineTo(-10, -14);
      ctx.quadraticCurveTo(-30, -24, -48, -15);
      ctx.closePath();
      ctx.fill();
      // A shine along it, and the tail lamp.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-44, -28);
      ctx.quadraticCurveTo(-40, -33, -30, -33.5);
      ctx.stroke();
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.ellipse(-48, -24, 2, 3.2, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // The seat.
      ctx.fillStyle = '#1f2228';
      ctx.beginPath();
      ctx.moveTo(-30, -36);
      ctx.quadraticCurveTo(-28, -42, -16, -42);
      ctx.lineTo(-4, -41);
      ctx.quadraticCurveTo(1, -40, 0, -36);
      ctx.closePath();
      ctx.fill();
      // The footboard, with the battery under it.
      ctx.fillStyle = '#2d3139';
      ctx.fillRect(-12, -18, 30, 6);
      ctx.fillStyle = '#4a505b';
      ctx.fillRect(-10, -18, 26, 1.6);
      // The leg shield and the steering column, up to the bars.
      ctx.fillStyle = paint;
      ctx.beginPath();
      ctx.moveTo(12, -12);
      ctx.lineTo(20, -12);
      ctx.quadraticCurveTo(31, -28, 28, -50);
      ctx.lineTo(21, -50);
      ctx.quadraticCurveTo(21, -30, 12, -18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(26, -46);
      ctx.quadraticCurveTo(28, -30, 21, -16);
      ctx.stroke();
      // The front mudguard over the wheel.
      ctx.strokeStyle = scheme.main;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.arc(30, -10, 13, -Math.PI * 0.95, -Math.PI * 0.15);
      ctx.stroke();
      // The headlamp, the handlebars, a grip and a mirror.
      ctx.fillStyle = '#fff6c9';
      ctx.beginPath();
      ctx.ellipse(30, -43, 3, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1f2228';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(19, -52);
      ctx.lineTo(28, -54);
      ctx.stroke();
      ctx.strokeStyle = '#8b919c';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(24, -53);
      ctx.lineTo(21, -60);
      ctx.stroke();
      ctx.fillStyle = '#c9ced6';
      ctx.beginPath();
      ctx.ellipse(20.5, -61, 2.6, 1.6, -0.3, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

/** The insulated delivery box, its lid left off, in a scheme's colours. */
export function boxSprite(scheme: DeliveryScheme): SpriteSource {
  return {
    key: `delivery/box/${scheme.main}`,
    width: BOX_W,
    height: BOX_H,
    paint(ctx) {
      const w = BOX_W;
      const h = BOX_H;
      const body = ctx.createLinearGradient(0, 0, w, 0);
      body.addColorStop(0, scheme.deep);
      body.addColorStop(0.3, scheme.main);
      body.addColorStop(0.75, scheme.main);
      body.addColorStop(1, scheme.deep);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 4);
      ctx.fill();
      // The silver reflective band round it.
      ctx.fillStyle = '#e4e8ee';
      ctx.fillRect(0, h * 0.68, w, 3.2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(0, h * 0.68, w, 1);
      // The emblem: a steaming bowl, as any food box might have.
      ctx.fillStyle = scheme.trim;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 9, h * 0.38);
      ctx.lineTo(w / 2 + 9, h * 0.38);
      ctx.quadraticCurveTo(w / 2 + 8, h * 0.6, w / 2, h * 0.6);
      ctx.quadraticCurveTo(w / 2 - 8, h * 0.6, w / 2 - 9, h * 0.38);
      ctx.fill();
      ctx.strokeStyle = scheme.trim;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (const dx of [-4, 0, 4]) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + dx, h * 0.32);
        ctx.quadraticCurveTo(w / 2 + dx + 2.5, h * 0.24, w / 2 + dx, h * 0.15);
        ctx.stroke();
      }
      // A dark seam down its front edge and a shine down its back edge.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.fillRect(w - 4, 2, 1.2, h - 4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(3, 3, 1.4, h - 6);
    },
  };
}

/** How far the rope is on: how much of each wrap is pulled down round the box (0 to 1), and how tied its knot is. */
export interface RopeLook {
  wraps: readonly [number, number];
  knot: number;
}

/** How the scooter is to be drawn this frame. */
export interface ScooterLook {
  tilt: number;
  /** How far the wheels have turned, in radians, and how fast they go (0 to 1), to blur their spokes. */
  spin: number;
  speed: number;
  /** How much the box swells with what is stuffed in it (1 as it is), and how far its lid is open (radians). */
  bulge: number;
  lid: number;
  /** How far the lid bows up in its middle, in px: pushed up from below, held down by the rope. */
  bow: number;
  /** The rope round the box, once he starts tying it. */
  rope?: RopeLook;
  /** What is in the box, drawn in the scooter's frame behind the box's front, so it peeks over the rim. */
  contents?: () => void;
}

/** The scooter, wheels and box, with its origin at (x, y). */
export function drawScooter(
  gfx: Gfx,
  x: number,
  y: number,
  scheme: DeliveryScheme,
  body: SpriteSource,
  box: SpriteSource,
  { tilt, spin, speed, bulge, lid, bow, rope, contents }: ScooterLook,
): void {
  gfx.push(x, y, tilt);
  drawWheel(gfx, REAR_WHEEL, spin, speed);
  drawWheel(gfx, FRONT_WHEEL, spin, speed);
  gfx.sprite(body, { x: 0, y: 0, anchorX: BODY_X / BODY_W, anchorY: BODY_Y / BODY_H });
  contents?.();
  // The box, swollen fat and squat, bottom down on the rack.
  const { sx, sy } = boxScale(bulge);
  gfx.sprite(box, {
    x: BOX_FOOT.x,
    y: BOX_FOOT.y,
    anchorX: 0.5,
    anchorY: 1,
    scaleX: sx,
    scaleY: sy,
  });
  // The lid, hinged at its back edge, bowed up in its middle.
  const hinge = hingeOf(bulge);
  const w = lidWidth(bulge);
  const mid: number[] = [];
  const shine: number[] = [];
  for (let k = 0; k <= 8; k++) {
    const u = k / 8;
    const up = bow * Math.sin(Math.PI * u);
    mid.push(u * w, -LID_H / 2 - up);
    shine.push(1 + u * (w - 2), -LID_H + 0.8 - up);
  }
  gfx.push(hinge.x, hinge.y, -lid);
  gfx.polyline(mid, LID_H, scheme.deep, { cap: 'butt' });
  gfx.polyline(shine, 1.6, scheme.light, { alpha: 0.8, cap: 'butt' });
  gfx.pop();
  if (rope) drawRope(gfx, rope, bulge, lid, bow);
  gfx.pop();
}

/** How much the box is stretched across and up, swollen by `bulge`. */
export function boxScale(bulge: number): { sx: number; sy: number } {
  return { sx: bulge, sy: 1 + (bulge - 1) * 0.7 };
}

/** The middle of the box's open top, its rim, swollen by `bulge`: what is packed in it peeks out over this. */
export function rimOf(bulge: number): Point {
  return { x: BOX_FOOT.x, y: BOX_FOOT.y - BOX_H * boxScale(bulge).sy };
}

/** The lid's hinge, at the rim's back edge. */
function hingeOf(bulge: number): Point {
  return { x: BOX_FOOT.x - (BOX_W / 2) * boxScale(bulge).sx - 1, y: rimOf(bulge).y };
}

/** How long the lid is, hinge to front. */
function lidWidth(bulge: number): number {
  return BOX_W * boxScale(bulge).sx + 2;
}

/**
 * How high the lid's underside is over the rim, `dx` px in front of the rim's middle, with the
 * lid open `lid` and bowed `bow`; Infinity once it is open so far it is out of the way.
 */
export function lidLift(dx: number, bulge: number, lid: number, bow: number): number {
  if (lid > 1.2) return Infinity;
  const w = lidWidth(bulge);
  const d = dx + w / 2;
  return d * Math.tan(lid) + bow * Math.sin(Math.PI * Math.min(1, Math.max(0, d / w)));
}

/** A point on top of the lid, `f` of the way from its hinge to its front: where his hands press. */
export function lidPoint(f: number, bulge: number, lid: number, bow: number): Point {
  const hinge = hingeOf(bulge);
  const along = f * lidWidth(bulge);
  const up = LID_H + bow * Math.sin(Math.PI * f);
  const c = Math.cos(lid);
  const s = Math.sin(lid);
  return { x: hinge.x + along * c - up * s, y: hinge.y - along * s - up * c };
}

/** Where wrap `k` of the rope crosses the top of the lid, and the bottom of the box. */
function ropeEnds(k: number, bulge: number, lid: number, bow: number): [Point, Point] {
  const dx = ROPE_AT[k]! * BOX_W * boxScale(bulge).sx;
  const rim = rimOf(bulge);
  const top = { x: rim.x + dx, y: rim.y - lidLift(dx, bulge, lid, bow) - LID_H - 0.6 };
  return [top, { x: rim.x + dx, y: BOX_FOOT.y + 1.6 }];
}

/** The end of wrap `k`, pulled `p` of the way down round the box: the end he is pulling on. */
export function ropePoint(k: number, p: number, bulge: number, lid: number, bow: number): Point {
  const [top, bottom] = ropeEnds(k, bulge, lid, bow);
  return { x: top.x, y: top.y + (bottom.y - top.y) * p };
}

/** Where the knot is: on top of the first wrap, at the lid. */
export function knotPoint(bulge: number, lid: number, bow: number): Point {
  const [top] = ropeEnds(0, bulge, lid, bow);
  return { x: top.x, y: top.y + 1.5 };
}

/** A length of rope from `from` to `to`, sagging `sag` px in its middle: the end he holds. */
export function drawSlack(gfx: Gfx, from: Point, to: Point, sag: number): void {
  const points: number[] = [];
  for (let k = 0; k <= 8; k++) {
    const u = k / 8;
    points.push(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u + sag * 4 * u * (1 - u));
  }
  gfx.polyline(points, 2, ROPE);
}

/** The rope: each wrap over the lid and down round the box as far as it has been pulled, and the knot. */
function drawRope(
  gfx: Gfx,
  { wraps, knot }: RopeLook,
  bulge: number,
  lid: number,
  bow: number,
): void {
  for (let k = 0; k < wraps.length; k++) {
    const p = wraps[k]!;
    if (p <= 0) continue;
    const [top] = ropeEnds(k, bulge, lid, bow);
    const end = ropePoint(k, p, bulge, lid, bow);
    // Over the lid's back edge, then down the box's side, twisted.
    gfx.line(top.x - 2.4, top.y + 1, top.x, top.y, 2.4, ROPE);
    gfx.line(top.x, top.y, end.x, end.y, 2.4, ROPE);
    gfx.line(top.x, top.y, end.x, end.y, 2.4, ROPE_TWIST, {
      dash: [1.4, 2.2],
      alpha: 0.7,
      cap: 'butt',
    });
  }
  if (knot > 0) {
    // The knot pops on, a little big at first, with its two ends hanging off it.
    const at = knotPoint(bulge, lid, bow);
    const s = knot * (1 + 0.5 * Math.sin(Math.PI * knot));
    gfx.polyline([at.x, at.y, at.x - 3 * s, at.y + 4 * s, at.x - 2 * s, at.y + 8 * s], 1.8, ROPE);
    gfx.polyline(
      [at.x, at.y, at.x + 2.5 * s, at.y + 5 * s, at.x + 1.5 * s, at.y + 9 * s],
      1.8,
      ROPE,
    );
    gfx.circle(at.x, at.y, 2.8 * s, ROPE, { stroke: { width: 0.8, color: ROPE_TWIST } });
  }
}

/** A wheel: its tyre, a silver rim and spokes that blur into a disc as it speeds up. */
function drawWheel(gfx: Gfx, at: Point, spin: number, speed: number): void {
  gfx.circle(at.x, at.y, WHEEL_R, '#1b1d22');
  gfx.ring(at.x, at.y, WHEEL_R - 1.4, 1, '#3a3e46');
  gfx.circle(at.x, at.y, 6.6, '#9aa1ad');
  gfx.circle(at.x, at.y, 5.4, '#5d636e');
  const blur = Math.min(1, speed * 1.6);
  for (let k = 0; k < 3; k++) {
    const a = spin + (k * Math.PI * 2) / 3;
    gfx.line(
      at.x - Math.cos(a) * 5.6,
      at.y - Math.sin(a) * 5.6,
      at.x + Math.cos(a) * 5.6,
      at.y + Math.sin(a) * 5.6,
      1.8,
      '#dfe3ea',
      { alpha: 1 - 0.75 * blur },
    );
  }
  if (blur > 0) gfx.circle(at.x, at.y, 5.6, '#c9ced6', { alpha: 0.35 * blur });
  gfx.circle(at.x, at.y, 1.8, '#e9edf2');
}

/** Where a point of the scooter's frame is in the world, with its origin at (x, y) tipped by `tilt`. */
export function toWorld(local: Point, x: number, y: number, tilt: number): Point {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return { x: x + local.x * c - local.y * s, y: y + local.x * s + local.y * c };
}
