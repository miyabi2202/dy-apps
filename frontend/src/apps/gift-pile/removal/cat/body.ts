import type { Gfx, Point, SpriteSource } from '../board';

// The cat, seen from the side. Its head is Canvas2D, painted once for each face it pulls
// (`headSprite`); its body, legs and tail are drawn each frame with plain `Gfx` calls, so it
// can walk, sit, crouch, stretch and paw at things. Everything here is in its own frame, in
// world pixels, facing right, with its origin on the ground between its feet, y down.

/** A cat's coat: its fur, the darker shade of its far side and stripes, its pale muzzle and chest, its outline, its eyes and nose. */
export interface CatPalette {
  /** Unique among the palettes, for the sprites' keys. */
  key: string;
  fur: string;
  shade: string;
  light: string;
  line: string;
  eye: string;
  nose: string;
  /** Inside its ears. */
  ear: string;
  /** Its whiskers, which have to show against its fur. */
  whisker: string;
  /** Whether it is a tabby, with stripes and the M on its forehead. */
  stripes: boolean;
}

export const CAT_PALETTES: readonly CatPalette[] = [
  // A ginger tabby, the first.
  {
    key: 'ginger',
    fur: '#f2a24f',
    shade: '#c66d22',
    light: '#fde8cc',
    line: '#6e3610',
    eye: '#9ccc4a',
    nose: '#e98a8f',
    ear: '#f4aaa4',
    whisker: 'rgba(255, 255, 255, 0.85)',
    stripes: true,
  },
  // A grey tabby.
  {
    key: 'grey',
    fur: '#a3abb4',
    shade: '#646d77',
    light: '#eceef1',
    line: '#343a41',
    eye: '#f2c14e',
    nose: '#d98c95',
    ear: '#e3a5ad',
    whisker: 'rgba(255, 255, 255, 0.85)',
    stripes: true,
  },
  // A black cat, rimmed in grey so it shows on a dark stream.
  {
    key: 'black',
    fur: '#2b2b32',
    shade: '#17171c',
    light: '#3c3c46',
    line: '#7a7a8c',
    eye: '#f5d33f',
    nose: '#55424a',
    ear: '#6a4752',
    whisker: 'rgba(235, 235, 245, 0.8)',
    stripes: false,
  },
  // A white cat with blue eyes.
  {
    key: 'white',
    fur: '#f6f3ee',
    shade: '#cfc7bb',
    light: '#ffffff',
    line: '#6f675d',
    eye: '#6ec3f0',
    nose: '#f2a1ad',
    ear: '#f6b4bd',
    whisker: 'rgba(130, 120, 110, 0.7)',
    stripes: false,
  },
];

/** The faces it pulls: in profile, staring straight at the viewer, a slow blink, and a yawn. */
export type Face = 'side' | 'front' | 'blink' | 'yawn';
const FACES: readonly Face[] = ['side', 'front', 'blink', 'yawn'];

/** The painted head, and where its middle is in it. */
const HEAD_W = 50;
const HEAD_H = 48;
const HEAD_CX = 25;
const HEAD_CY = 29;

const heads = new Map<string, SpriteSource>();

/** Its head pulling `face`, painted once (the same object each time it is asked for). */
export function headSprite(palette: CatPalette, face: Face): SpriteSource {
  const key = `cat/head/${palette.key}/${face}`;
  let sprite = heads.get(key);
  if (!sprite) {
    sprite = {
      key,
      width: HEAD_W,
      height: HEAD_H,
      paint(ctx) {
        ctx.translate(HEAD_CX, HEAD_CY);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (face === 'side') paintProfile(ctx, palette);
        else paintFace(ctx, palette, face);
      },
    };
    heads.set(key, sprite);
  }
  return sprite;
}

/** Every head a palette has, to paint ahead of time. */
export function headSprites(palette: CatPalette): SpriteSource[] {
  return FACES.map((face) => headSprite(palette, face));
}

/**
 * Its face from the front, as it turns to look at the viewer: wide cheeks, ears up, and eyes
 * that depend on `face`. Staring, they are big and round under flat, heavy lids: deadpan.
 */
export function paintFace(ctx: CanvasRenderingContext2D, p: CatPalette, face: Face): void {
  // The ears, with their pink insides.
  for (const s of [-1, 1]) {
    ctx.fillStyle = p.fur;
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s * 3.5, -9.5);
    ctx.lineTo(s * 13.5, -21);
    ctx.lineTo(s * 14.5, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.ear;
    ctx.beginPath();
    ctx.moveTo(s * 6.5, -9.5);
    ctx.lineTo(s * 12.6, -17.5);
    ctx.lineTo(s * 12.8, -6);
    ctx.closePath();
    ctx.fill();
  }
  // The head, wider at the cheeks, with a tuft of fur at each.
  const fur = ctx.createRadialGradient(0, -2, 2, 0, 0, 16);
  fur.addColorStop(0, p.fur);
  fur.addColorStop(0.75, p.fur);
  fur.addColorStop(1, p.shade);
  ctx.fillStyle = fur;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -12.5);
  ctx.bezierCurveTo(9, -12.5, 14.5, -7, 14.5, 0);
  ctx.lineTo(17, 3.5);
  ctx.lineTo(14, 4.5);
  ctx.lineTo(15.5, 7.5);
  ctx.bezierCurveTo(10, 12.5, 4, 13, 0, 13);
  ctx.bezierCurveTo(-4, 13, -10, 12.5, -15.5, 7.5);
  ctx.lineTo(-14, 4.5);
  ctx.lineTo(-17, 3.5);
  ctx.lineTo(-14.5, 0);
  ctx.bezierCurveTo(-14.5, -7, -9, -12.5, 0, -12.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // A tabby's M on its forehead and the stripes on its cheeks.
  if (p.stripes) {
    ctx.strokeStyle = p.shade;
    ctx.lineWidth = 1.6;
    for (const [x0, y0, x1, y1] of [
      [-4.5, -11.5, -3.2, -6.5],
      [0, -12.3, 0, -7],
      [4.5, -11.5, 3.2, -6.5],
      [-14.2, 1.5, -9.8, 2.4],
      [-14.6, 5, -10.4, 5],
      [14.2, 1.5, 9.8, 2.4],
      [14.6, 5, 10.4, 5],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
  if (face === 'yawn') {
    paintYawn(ctx, p);
    return;
  }
  // The muzzle and chin.
  ctx.fillStyle = p.light;
  ctx.beginPath();
  ctx.ellipse(-3.1, 5.4, 4.4, 3.5, 0, 0, Math.PI * 2);
  ctx.ellipse(3.1, 5.4, 4.4, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 9, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  paintEyes(ctx, p, face);
  // The nose and the little mouth under it.
  ctx.fillStyle = p.nose;
  ctx.beginPath();
  ctx.moveTo(-2.1, 2.3);
  ctx.lineTo(2.1, 2.3);
  ctx.lineTo(0, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, 4.5);
  ctx.lineTo(0, 5.6);
  ctx.moveTo(-2.6, 6.3);
  ctx.quadraticCurveTo(-1.2, 7.1, 0, 5.6);
  ctx.quadraticCurveTo(1.2, 7.1, 2.6, 6.3);
  ctx.stroke();
  paintWhiskers(ctx, p, 1);
}

/** Its eyes from the front: staring under flat lids, or shut in a slow blink. */
function paintEyes(ctx: CanvasRenderingContext2D, p: CatPalette, face: Face): void {
  for (const s of [-1, 1]) {
    const ex = s * 5.7;
    const ey = -1.3;
    if (face === 'blink') {
      // Shut, content: a cat's slow blink.
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ex, ey - 1.6, 3.4, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      continue;
    }
    const iris = ctx.createRadialGradient(ex, ey + 1, 0.5, ex, ey, 4);
    iris.addColorStop(0, '#ffffff');
    iris.addColorStop(0.25, p.eye);
    iris.addColorStop(1, p.eye);
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(ex, ey, 3.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#121014';
    ctx.beginPath();
    ctx.ellipse(ex, ey + 0.4, 1.3, 2.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + 1.2, ey + 0.4, 0.8, 0, Math.PI * 2);
    ctx.fill();
    // The heavy lid, flat across the top half: utterly unimpressed.
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, 4.05, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = p.fur;
    ctx.fillRect(ex - 5, ey - 5, 10, 4.4);
    ctx.restore();
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ex, ey, 3.9, -0.15 * Math.PI, 1.15 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex - 4.4, ey - 0.6);
    ctx.lineTo(ex + 4.4, ey - 0.6);
    ctx.stroke();
  }
}

/** A huge yawn: eyes squeezed shut, the mouth wide open, tongue and fangs. */
function paintYawn(ctx: CanvasRenderingContext2D, p: CatPalette): void {
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 9, -4.5);
    ctx.lineTo(s * 4.3, -2.2);
    ctx.lineTo(s * 9, -0.2);
    ctx.stroke();
  }
  ctx.fillStyle = p.light;
  ctx.beginPath();
  ctx.ellipse(-5.2, 3.5, 3.6, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(5.2, 3.5, 3.6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5c1a24';
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 6.8, 5.2, 6.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ef8090';
  ctx.beginPath();
  ctx.ellipse(0, 10.2, 3.6, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 3.6, 1.6);
    ctx.lineTo(s * 2.2, 1.6);
    ctx.lineTo(s * 3, 4.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = p.nose;
  ctx.beginPath();
  ctx.moveTo(-2, -0.4);
  ctx.lineTo(2, -0.4);
  ctx.lineTo(0, 1.6);
  ctx.closePath();
  ctx.fill();
  paintWhiskers(ctx, p, 1.15);
}

/** Three whiskers each side of its muzzle, `spread` times as fanned out. */
function paintWhiskers(ctx: CanvasRenderingContext2D, p: CatPalette, spread: number): void {
  ctx.strokeStyle = p.whisker;
  ctx.lineWidth = 0.6;
  for (const s of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 6.5, 5.5 + k * 0.8);
      ctx.quadraticCurveTo(s * 13, 4 + k * 2 * spread, s * 21, 3.5 + k * 3.4 * spread);
      ctx.stroke();
    }
  }
}

/** Its head in profile, facing right, looking ahead under the same heavy lid. */
function paintProfile(ctx: CanvasRenderingContext2D, p: CatPalette): void {
  // The far ear, behind.
  ctx.fillStyle = p.shade;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(1, -9.5);
  ctx.lineTo(6.5, -20.5);
  ctx.lineTo(9.5, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The head and its muzzle.
  const fur = ctx.createRadialGradient(3, -2, 2, 0, 0, 15);
  fur.addColorStop(0, p.fur);
  fur.addColorStop(0.75, p.fur);
  fur.addColorStop(1, p.shade);
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.moveTo(-12.5, 2);
  ctx.bezierCurveTo(-13, -8, -6, -12, 2, -11.5);
  ctx.bezierCurveTo(9, -11, 13, -6.5, 14, -1.5);
  ctx.bezierCurveTo(16.5, -0.5, 17.5, 2, 16.5, 4);
  ctx.bezierCurveTo(15, 7.5, 11, 9.5, 6, 10);
  ctx.bezierCurveTo(-1, 11, -6, 10.5, -10, 7.5);
  ctx.lineTo(-14, 6.5);
  ctx.lineTo(-11.5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The near ear, with its pink inside.
  ctx.fillStyle = p.fur;
  ctx.beginPath();
  ctx.moveTo(-8.5, -7);
  ctx.lineTo(-5, -21);
  ctx.lineTo(2.5, -10.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ear;
  ctx.beginPath();
  ctx.moveTo(-6.4, -8.6);
  ctx.lineTo(-4.8, -17.5);
  ctx.lineTo(0, -10.5);
  ctx.closePath();
  ctx.fill();
  if (p.stripes) {
    ctx.strokeStyle = p.shade;
    ctx.lineWidth = 1.6;
    for (const [x0, y0, x1, y1] of [
      [-3, -11, -1.5, -6.5],
      [1.5, -11.5, 2.5, -7],
      [-12.5, 0, -7.5, 1],
      [-12, 3.5, -7.5, 4],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
  // The muzzle and chin, pale.
  ctx.fillStyle = p.light;
  ctx.beginPath();
  ctx.ellipse(11.5, 4.2, 4.8, 3.4, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8.5, 8, 4.2, 2.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // The eye, an almond under its flat lid, looking ahead.
  const ex = 7.2;
  const ey = -2.2;
  ctx.fillStyle = p.eye;
  ctx.beginPath();
  ctx.ellipse(ex, ey, 2.7, 3.3, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#121014';
  ctx.beginPath();
  ctx.ellipse(ex + 0.9, ey + 0.3, 0.9, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ex + 1.4, ey + 0.8, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(ex, ey, 2.85, 3.45, 0.1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = p.fur;
  ctx.fillRect(ex - 4, ey - 4, 8, 3.6);
  ctx.restore();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(ex - 3, ey - 0.6);
  ctx.lineTo(ex + 3, ey - 0.3);
  ctx.stroke();
  // The nose at the tip, and the mouth.
  ctx.fillStyle = p.nose;
  ctx.beginPath();
  ctx.ellipse(15.8, 1.6, 1.5, 1.1, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(15.4, 4.4);
  ctx.quadraticCurveTo(13.5, 6.4, 11.5, 5.6);
  ctx.stroke();
  // Whiskers, forward and back.
  ctx.strokeStyle = p.whisker;
  ctx.lineWidth = 0.6;
  for (const k of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(12, 4.5 + k * 0.8);
    ctx.quadraticCurveTo(18, 3.5 + k * 2, 24, 3 + k * 3.4);
    ctx.stroke();
  }
}

/** Where its parts are, in its own frame, for one pose. */
interface Anchors {
  /** Its body: an ellipse's middle, half sizes and tilt. */
  bx: number;
  by: number;
  rx: number;
  ry: number;
  rot: number;
  /** Shoulder and hip, where its legs join. */
  sx: number;
  sy: number;
  hx: number;
  hy: number;
  /** The middle of its head. */
  headX: number;
  headY: number;
  /** Where its front and hind feet stand, across. */
  frontX: number;
  hindX: number;
  /** Where its tail joins on. */
  tx: number;
  ty: number;
}

/** Standing on all fours. */
const STAND: Anchors = {
  bx: 0,
  by: -27,
  rx: 21,
  ry: 11,
  rot: 0,
  sx: 13,
  sy: -25,
  hx: -14,
  hy: -26,
  headX: 25,
  headY: -39,
  frontX: 14,
  hindX: -15,
  tx: -19,
  ty: -31,
};
/** Sitting up, its front legs straight and its haunch on the ground. */
const SIT: Anchors = {
  bx: -3,
  by: -23,
  rx: 17,
  ry: 12.5,
  rot: -1.05,
  sx: 5,
  sy: -24,
  hx: -9,
  hy: -12,
  headX: 5,
  headY: -50,
  frontX: 7,
  hindX: 1,
  tx: -17,
  ty: -6,
};
/** Crouched to pounce: front down, rear up. */
const CROUCH: Anchors = {
  bx: 1,
  by: -19,
  rx: 22,
  ry: 10,
  rot: 0.12,
  sx: 14,
  sy: -13,
  hx: -14,
  hy: -24,
  headX: 28,
  headY: -24,
  frontX: 21,
  hindX: -13,
  tx: -20,
  ty: -27,
};
/** Stretching: front legs out flat ahead, rear high. */
const STRETCH: Anchors = {
  bx: 0,
  by: -22,
  rx: 23,
  ry: 10,
  rot: 0.42,
  sx: 14,
  sy: -10,
  hx: -15,
  hy: -33,
  headX: 28,
  headY: -14,
  frontX: 36,
  hindX: -17,
  tx: -20,
  ty: -38,
};

/** Where its parts are, standing, then as far into sitting, crouching and stretching as asked. */
export function anchorsOf(sit: number, crouch: number, stretch: number): Anchors {
  const a = { ...STAND };
  mix(a, SIT, sit);
  mix(a, CROUCH, crouch);
  mix(a, STRETCH, stretch);
  return a;
}

/** Move `a` a share `u` of the way to `b`. */
function mix(a: Anchors, b: Anchors, u: number): void {
  if (u <= 0) return;
  for (const k of Object.keys(a) as (keyof Anchors)[]) a[k] += (b[k] - a[k]) * u;
}

/** How it is to be drawn this frame. */
export interface CatLook {
  /** Where it stands, on the ground between its feet, and which way it faces. */
  x: number;
  y: number;
  facing: 1 | -1;
  /** How far into sitting, crouching and stretching it is, 0 to 1 each. */
  sit: number;
  crouch: number;
  stretch: number;
  /** Where its legs are in their stride (radians), and how big its strides are (0 standing still). */
  stride: number;
  gait: number;
  /** How far its body bobs up off its legs, in px, as it runs. */
  bounce: number;
  /** Its near front paw: how far it is moved from its foot (0) to `paw` (1), in its own frame. */
  pawReach: number;
  paw: Point;
  /** How far its rear sways, in px, wiggling before a pounce. */
  wiggle: number;
  face: Face;
  /** Its head's tilt, radians clockwise as it faces right (down, looking at something low). */
  headTilt: number;
  /** Its tail: up proudly (1), or flat out behind it as it runs (`tailFlat`). */
  tailUp: number;
  tailFlat: number;
  /** The frame's time in ms, for the tail's swish. */
  t: number;
}

/** A look standing still, facing right, to start from. */
export const STILL: CatLook = {
  x: 0,
  y: 0,
  facing: 1,
  sit: 0,
  crouch: 0,
  stretch: 0,
  stride: 0,
  gait: 0,
  bounce: 0,
  pawReach: 0,
  paw: { x: 0, y: 0 },
  wiggle: 0,
  face: 'side',
  headTilt: 0,
  tailUp: 0,
  tailFlat: 0,
  t: 0,
};

/** Where a point of its own frame is in the world, for a cat drawn as `look` says. */
export function catToWorld(look: CatLook, local: Point): Point {
  return { x: look.x + look.facing * local.x, y: look.y + local.y };
}

/** The tail's segments, and how long each is. */
const TAIL_SEGMENTS = 10;
const TAIL_STEP = 5.2;

/** The cat, as `look` says. */
export function drawCat(gfx: Gfx, p: CatPalette, look: CatLook): void {
  const { x, y, facing: f } = look;
  const a = anchorsOf(look.sit, look.crouch, look.stretch);
  const lift = -look.bounce;
  // The rear sways as it wiggles; the front stays put.
  a.hx += look.wiggle * 0.3;
  a.hy += Math.abs(look.wiggle) * 0.2;
  a.tx += look.wiggle;
  const X = (v: number) => x + f * v;
  const Y = (v: number) => y + v;

  gfx.ellipse(X(a.bx * 0.4), Y(1), 22 - 4 * look.sit, 3.6, 0, '#000000', { alpha: 0.22, soft: 3 });

  drawTail(gfx, p, look, a, X, Y, lift);

  // The legs: where each foot is in its stride, the far pair half a stride from the near.
  const stepAt = (phase: number) => ({
    dx: Math.sin(phase) * 7 * look.gait,
    up: Math.max(0, Math.cos(phase)) * 5 * look.gait,
  });
  const nearFront = stepAt(look.stride);
  const farFront = stepAt(look.stride + Math.PI);
  const nearHind = stepAt(look.stride + Math.PI);
  const farHind = stepAt(look.stride);
  const sx = a.sx;
  const sy = a.sy + lift;
  const hx = a.hx;
  const hy = a.hy + lift;

  // The far legs, in shade.
  frontLeg(gfx, p, p.shade, X, Y, sx - 3, sy, a.frontX - 3 + farFront.dx, -farFront.up);
  hindLeg(gfx, p, p.shade, X, Y, hx + 3, hy, a.hindX + 3 + farHind.dx, -farHind.up, look.sit);

  // The body, with its pale chest and belly and a tabby's stripes across its back.
  const rot = f * a.rot;
  gfx.ellipse(X(a.bx), Y(a.by + lift), a.rx, a.ry, rot, p.fur, {
    stroke: { width: 1.3, color: p.line },
  });
  const c = Math.cos(a.rot);
  const s = Math.sin(a.rot);
  const inBody = (u: number, v: number) => ({
    x: X(a.bx + u * c - v * s),
    y: Y(a.by + lift + u * s + v * c),
  });
  const belly = inBody(a.rx * 0.25, a.ry * 0.45);
  gfx.ellipse(belly.x, belly.y, a.rx * 0.62, a.ry * 0.45, rot, p.light, { alpha: 0.9 });
  if (p.stripes) {
    for (const u of [-0.55, -0.25, 0.05]) {
      const top = inBody(a.rx * u, -a.ry * 0.98);
      const end = inBody(a.rx * (u - 0.06), -a.ry * 0.35);
      gfx.line(top.x, top.y, end.x, end.y, 3, p.shade, { alpha: 0.85 });
    }
  }
  // Sitting, its haunch, round on the ground.
  const haunch = 12.5 * Math.min(1, look.sit * 1.3);
  if (haunch > 1) {
    gfx.circle(X(-8), Y(-11.5 + lift), haunch, p.fur, { stroke: { width: 1.3, color: p.line } });
    if (p.stripes && haunch > 6) {
      gfx.line(X(-14), Y(-15), X(-9), Y(-14), 2.6, p.shade, { alpha: 0.8 * look.sit });
      gfx.line(X(-15), Y(-10), X(-10), Y(-9.5), 2.6, p.shade, { alpha: 0.8 * look.sit });
    }
  }

  // The near legs; its front paw goes where it reaches for.
  hindLeg(gfx, p, p.fur, X, Y, hx, hy, a.hindX + nearHind.dx, -nearHind.up, look.sit);
  const footX = a.frontX + nearFront.dx;
  const footY = -nearFront.up;
  const r = Math.min(1, Math.max(0, look.pawReach));
  frontLeg(
    gfx,
    p,
    p.fur,
    X,
    Y,
    sx,
    sy,
    footX + (look.paw.x - footX) * r,
    footY + (look.paw.y - footY) * r,
  );

  // The neck, joining the body to the head, and the head pulling its face.
  const nx = (a.sx + a.headX) / 2 - 2;
  const ny = (a.sy + a.headY) / 2 + 2 + lift;
  gfx.ellipse(X(nx), Y(ny), 10, 9, rot, p.fur);
  gfx.sprite(headSprite(p, look.face), {
    x: X(a.headX),
    y: Y(a.headY + lift),
    anchorX: HEAD_CX / HEAD_W,
    anchorY: HEAD_CY / HEAD_H,
    rotation: f * look.headTilt,
    flipX: f < 0 && look.face === 'side',
  });
}

/** A front leg from the shoulder straight down to its paw, in `color`. */
function frontLeg(
  gfx: Gfx,
  p: CatPalette,
  color: string,
  X: (v: number) => number,
  Y: (v: number) => number,
  sx: number,
  sy: number,
  fx: number,
  fy: number,
): void {
  gfx.line(X(sx), Y(sy), X(fx), Y(fy - 2), 8.6, p.line);
  gfx.line(X(sx), Y(sy), X(fx), Y(fy - 2), 6.2, color);
  gfx.ellipse(X(fx + 1), Y(fy - 2.2), 4.4, 3, 0, color, { stroke: { width: 1.1, color: p.line } });
}

/** A hind leg from the hip, forward to the knee, back to the hock and down to its paw, in `color`. */
function hindLeg(
  gfx: Gfx,
  p: CatPalette,
  color: string,
  X: (v: number) => number,
  Y: (v: number) => number,
  hx: number,
  hy: number,
  fx: number,
  fy: number,
  sit: number,
): void {
  // Sitting folds it up under the haunch: the knee forward, the hock flat on the ground.
  const kx = hx + 6 + 4 * sit;
  const ky = hy * 0.5 + fy * 0.5 - 2 * sit;
  const ox = fx - 6 + 2 * sit;
  const oy = fy - 9 + 7 * sit;
  const points = [X(hx), Y(hy), X(kx), Y(ky), X(ox), Y(oy), X(fx), Y(fy - 2)];
  gfx.polyline(points, 8.6, p.line);
  gfx.polyline(points, 6.2, color);
  gfx.ellipse(X(fx + 1), Y(fy - 2.2), 4.4, 3, 0, color, { stroke: { width: 1.1, color: p.line } });
}

/** Its tail: proudly up in a question mark, flat out as it runs, or curled round its feet as it sits. */
function drawTail(
  gfx: Gfx,
  p: CatPalette,
  look: CatLook,
  a: Anchors,
  X: (v: number) => number,
  Y: (v: number) => number,
  lift: number,
): void {
  // Where it starts pointing and how much it curls along its length, by how the cat is.
  let start = Math.PI - 0.45;
  let curl = -0.05;
  const toward = (s: number, c: number, u: number) => {
    start += (s - start) * u;
    curl += (c - curl) * u;
  };
  toward(-Math.PI / 2 - 0.45, 0.11, look.tailUp);
  toward(Math.PI + 0.12, -0.02, look.tailFlat);
  toward(Math.PI * 0.6, -0.27, look.sit);
  const points: number[] = [];
  let px = a.tx;
  let py = a.ty + lift * (1 - look.sit);
  points.push(X(px), Y(py));
  let angle = start;
  for (let k = 1; k <= TAIL_SEGMENTS; k++) {
    // A lazy swish, stronger towards the tip, and quicker as it runs.
    const swish = Math.sin(look.t * (0.004 + 0.012 * look.tailFlat) - k * 0.5) * (0.04 + 0.018 * k);
    angle += curl + swish * (1 - 0.6 * look.sit);
    px += Math.cos(angle) * TAIL_STEP;
    py = Math.min(-2.5, py + Math.sin(angle) * TAIL_STEP);
    points.push(X(px), Y(py));
  }
  const width = (u: number) => 7 * (1 - 0.45 * u);
  gfx.ribbon(points, (u) => width(u) + 2.4, p.line, { alphaFrom: 1, alphaTo: 1 });
  gfx.ribbon(points, width, p.fur, { alphaFrom: 1, alphaTo: 1 });
  if (p.stripes) {
    // Rings round it, darker to the tip.
    for (const k of [3, 5, 7, 9]) {
      const bx = points[2 * k]!;
      const by = points[2 * k + 1]!;
      const dx = points[2 * k + 2]! - points[2 * k - 2]!;
      const dy = points[2 * k + 3]! - points[2 * k - 1]!;
      const d = Math.hypot(dx, dy) || 1;
      const half = width(k / TAIL_SEGMENTS) * 0.5;
      gfx.line(
        bx - (dy / d) * half,
        by + (dx / d) * half,
        bx + (dy / d) * half,
        by - (dx / d) * half,
        2.2,
        p.shade,
        { cap: 'butt' },
      );
    }
  }
}
