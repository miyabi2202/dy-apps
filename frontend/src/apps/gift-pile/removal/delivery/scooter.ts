import type { Gfx, Point, SpriteSource } from '../board';

// The electric scooter and its insulated delivery box, seen from the side and facing right. The
// body and the box are painted once each with Canvas2D; the wheels, which spin, are drawn over
// them each frame with plain `Gfx` calls. The box is its own sprite so it can bulge as it is
// stuffed and its lid can flap. Everything here is in the scooter's own frame, in world pixels,
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

/** How the scooter is to be drawn this frame. */
export interface ScooterLook {
  tilt: number;
  /** How far the wheels have turned, in radians, and how fast they go (0 to 1), to blur their spokes. */
  spin: number;
  speed: number;
  /** How much the box swells with what is stuffed in it (1 as it is), and how far its lid is flung open (radians). */
  bulge: number;
  lid: number;
}

/** The scooter, wheels and box, with its origin at (x, y). */
export function drawScooter(
  gfx: Gfx,
  x: number,
  y: number,
  scheme: DeliveryScheme,
  body: SpriteSource,
  box: SpriteSource,
  { tilt, spin, speed, bulge, lid }: ScooterLook,
): void {
  gfx.push(x, y, tilt);
  drawWheel(gfx, REAR_WHEEL, spin, speed);
  drawWheel(gfx, FRONT_WHEEL, spin, speed);
  gfx.sprite(body, { x: 0, y: 0, anchorX: BODY_X / BODY_W, anchorY: BODY_Y / BODY_H });
  // The box, swollen fat and squat, bottom down on the rack.
  const sx = bulge;
  const sy = 1 + (bulge - 1) * 0.7;
  gfx.sprite(box, {
    x: BOX_FOOT.x,
    y: BOX_FOOT.y,
    anchorX: 0.5,
    anchorY: 1,
    scaleX: sx,
    scaleY: sy,
  });
  // The lid, hinged at its back edge.
  const top = BOX_FOOT.y - BOX_H * sy;
  const back = BOX_FOOT.x - (BOX_W / 2) * sx;
  const w = BOX_W * sx + 2;
  gfx.push(back - 1, top, -lid);
  gfx.rect(0, -LID_H, w, LID_H, scheme.deep, { radius: 2 });
  gfx.rect(1, -LID_H, w - 2, 1.6, scheme.light, { radius: 1, alpha: 0.8 });
  gfx.pop();
  gfx.pop();
}

/** Where the top of the box is, in the scooter's frame, swollen by `bulge`: where the tower stands. */
export function boxTop(bulge: number): Point {
  return { x: BOX_FOOT.x, y: BOX_FOOT.y - BOX_H * (1 + (bulge - 1) * 0.7) - LID_H };
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
