import type { Gfx, Point, SpriteSource } from '../board';

// The cat, a round little chibi seen from the side: a big head on a small chubby body, short
// stubby legs and a fluffy tail. Its head is Canvas2D, painted once for each face it pulls
// (`headSprite`); its body, legs and tail are drawn each frame with plain `Gfx` calls, so it
// can walk, sit, crouch, stretch and paw at things. Everything here is in its own frame, in
// world pixels, facing right, with its origin on the ground between its feet, y down.

/** A cat's coat: its fur and the shade of its far side and stripes, its pale muzzle and belly, its outline, and its face's colours. */
export interface CatPalette {
  /** Unique among the palettes, for the sprites' keys. */
  key: string;
  fur: string;
  shade: string;
  light: string;
  /** Its outline: a soft, darker tone of its coat (lighter than the coat on the black cat, so it shows on a dark stream). */
  line: string;
  eye: string;
  nose: string;
  /** Inside its ears, and its toe beans. */
  ear: string;
  /** The rosy ovals on its cheeks. */
  blush: string;
  /** Its whiskers, which have to show against its fur. */
  whisker: string;
  /** Whether it is a tabby, with a few simple stripes. */
  stripes: boolean;
}

export const CAT_PALETTES: readonly CatPalette[] = [
  // A ginger tabby, the first.
  {
    key: 'ginger',
    fur: '#f9b56a',
    shade: '#e98f45',
    light: '#fff2dd',
    line: '#b4652f',
    eye: '#8fcf5a',
    nose: '#f5838f',
    ear: '#ffb9b5',
    blush: '#ff8a96',
    whisker: '#b4652f',
    stripes: true,
  },
  // A grey tabby.
  {
    key: 'grey',
    fur: '#c3cad6',
    shade: '#9aa5b8',
    light: '#f7f8fb',
    line: '#66718a',
    eye: '#f7c548',
    nose: '#f490a0',
    ear: '#ffc0cb',
    blush: '#ff97ab',
    whisker: '#66718a',
    stripes: true,
  },
  // A black cat with a lighter muzzle and big bright eyes, rimmed in lavender so it shows on a dark stream.
  {
    key: 'black',
    fur: '#3d3b4c',
    shade: '#2c2a38',
    light: '#6b6884',
    line: '#9e9abb',
    eye: '#ffd94a',
    nose: '#f58aa3',
    ear: '#d58aa2',
    blush: '#ff7fa0',
    whisker: 'rgba(235, 232, 250, 0.85)',
    stripes: false,
  },
  // A white cat with blue eyes.
  {
    key: 'white',
    fur: '#fffaf2',
    shade: '#eadccb',
    light: '#ffffff',
    line: '#b49c84',
    eye: '#72c4f2',
    nose: '#f79aab',
    ear: '#ffc2cb',
    blush: '#ffa0b2',
    whisker: '#b49c84',
    stripes: false,
  },
];

/** The dark of its pupils. */
const PUPIL = '#2a2232';

/** The faces it pulls: in profile, staring straight at the viewer, a slow blink, and a yawn. */
export type Face = 'side' | 'front' | 'blink' | 'yawn';
const FACES: readonly Face[] = ['side', 'front', 'blink', 'yawn'];

/** The painted head, and where its middle is in it. */
const HEAD_W = 56;
const HEAD_H = 52;
const HEAD_CX = 28;
const HEAD_CY = 29;
/** How far above its head's middle the tips of its ears are. */
export const HEAD_TOP = 23;

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

/** Its round, wide head, a little fuller at the cheeks than the crown, as a path round (0, 0). */
function headPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(0, -13.5);
  ctx.bezierCurveTo(10, -13.5, 17, -8.5, 17, 1);
  ctx.bezierCurveTo(17, 9, 9.5, 13, 0, 13);
  ctx.bezierCurveTo(-9.5, 13, -17, 9, -17, 1);
  ctx.bezierCurveTo(-17, -8.5, -10, -13.5, 0, -13.5);
  ctx.closePath();
}

/** The head filled and outlined, with a soft sheen on its crown and its pale muzzle, and `inside` drawn clipped to it. */
function paintHead(
  ctx: CanvasRenderingContext2D,
  p: CatPalette,
  muzzleX: number,
  inside?: () => void,
): void {
  const fur = ctx.createRadialGradient(-4, -6, 2, 0, 0, 18);
  fur.addColorStop(0, p.fur);
  fur.addColorStop(0.7, p.fur);
  fur.addColorStop(1, p.shade);
  ctx.fillStyle = fur;
  headPath(ctx);
  ctx.fill();
  ctx.save();
  headPath(ctx);
  ctx.clip();
  // A soft sheen on its crown.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.ellipse(-4, -8, 9, 4.5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // The pale muzzle and chin.
  ctx.fillStyle = p.light;
  ctx.beginPath();
  ctx.ellipse(muzzleX, 8.5, 9.5 - Math.abs(muzzleX) * 0.25, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();
  inside?.();
  ctx.restore();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.6;
  headPath(ctx);
  ctx.stroke();
}

/** A rounded ear: its base from (x0, y0) to (x1, y1), its tip at (tx, ty), with a pink inside if `inner`. */
function paintEar(
  ctx: CanvasRenderingContext2D,
  p: CatPalette,
  fill: string,
  x0: number,
  y0: number,
  tx: number,
  ty: number,
  x1: number,
  y1: number,
  inner: boolean,
): void {
  const earPath = (k: number) => {
    // `k` shrinks it towards the middle of its base, for the inside.
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const ax = mx + (x0 - mx) * k;
    const ay = my + (y0 - my) * k;
    const bx = mx + (x1 - mx) * k;
    const by = my + (y1 - my) * k;
    const cx = mx + (tx - mx) * k;
    const cy = my + (ty - my) * k;
    // Straight up its sides, and round over its tip.
    const round = 0.3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx + (ax - cx) * round, cy + (ay - cy) * round);
    ctx.quadraticCurveTo(cx, cy, cx + (bx - cx) * round, cy + (by - cy) * round);
    ctx.lineTo(bx, by);
    ctx.closePath();
  };
  ctx.fillStyle = fill;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.6;
  earPath(1);
  ctx.fill();
  ctx.stroke();
  if (inner) {
    ctx.fillStyle = p.ear;
    earPath(0.58);
    ctx.fill();
  }
}

/** A tabby's few stripes: three short strokes on its crown, centred on `x`. */
function paintCrownStripes(ctx: CanvasRenderingContext2D, p: CatPalette, x: number): void {
  ctx.strokeStyle = p.shade;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  for (const [x0, y0, x1, y1] of [
    [-4.2, -12.2, -3.4, -8.6],
    [0, -13, 0, -8],
    [4.2, -12.2, 3.4, -8.6],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x + x0, y0);
    ctx.lineTo(x + x1, y1);
    ctx.stroke();
  }
}

/** Rosy cheeks. */
function paintBlush(ctx: CanvasRenderingContext2D, p: CatPalette, xs: readonly number[]): void {
  ctx.fillStyle = p.blush;
  ctx.globalAlpha = 0.6;
  for (const x of xs) {
    ctx.beginPath();
    ctx.ellipse(x, 6.2, 3.3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Its tiny pink nose, a rounded triangle with its point down at (x, y). */
function paintNose(ctx: CanvasRenderingContext2D, p: CatPalette, x: number, y: number): void {
  ctx.fillStyle = p.nose;
  ctx.strokeStyle = p.nose;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 1.7, y - 1.3);
  ctx.lineTo(x + 1.7, y - 1.3);
  ctx.lineTo(x, y + 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** A round eye at (x, y), `rx` by `ry`: its iris, and a big pupil looking `look` px forward. */
function paintEye(
  ctx: CanvasRenderingContext2D,
  p: CatPalette,
  x: number,
  y: number,
  rx: number,
  ry: number,
  look: number,
): void {
  ctx.fillStyle = p.eye;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PUPIL;
  ctx.beginPath();
  ctx.ellipse(x + look, y - ry * 0.12, rx * 0.74, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PUPIL;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** An eye's sparkles: a big one up and to the right, a small one down and to the left. */
function paintSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  big: number,
  small: number,
): void {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + big * 0.8, y - big * 0.7, big, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - big * 0.9, y + big * 1.3, small, 0, Math.PI * 2);
  ctx.fill();
}

/** Its 'ω' mouth under its nose at (x, y). */
function paintMouth(ctx: CanvasRenderingContext2D, p: CatPalette, x: number, y: number): void {
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x - 3, y + 0.4);
  ctx.quadraticCurveTo(x - 1.5, y + 2.6, x, y);
  ctx.quadraticCurveTo(x + 1.5, y + 2.6, x + 3, y + 0.4);
  ctx.stroke();
}

/** Two short whiskers a side, out past its cheeks. */
function paintWhiskers(
  ctx: CanvasRenderingContext2D,
  p: CatPalette,
  sides: readonly number[],
): void {
  ctx.strokeStyle = p.whisker;
  ctx.lineWidth = 0.9;
  for (const s of sides) {
    for (const [y0, y1] of [
      [4, 2.5],
      [6.6, 7.6],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(s * 14.5, y0);
      ctx.lineTo(s * 21, y1);
      ctx.stroke();
    }
  }
}

/**
 * Its face from the front, as it turns to look at the viewer: a big round head, ears up, rosy
 * cheeks, and eyes that depend on `face`. Staring, they are big and round under flat,
 * half-shut lids: deadpan, and still adorable.
 */
export function paintFace(ctx: CanvasRenderingContext2D, p: CatPalette, face: Face): void {
  for (const s of [-1, 1])
    paintEar(ctx, p, p.fur, s * 4, -11.5, s * 13, -HEAD_TOP, s * 16, -3, true);
  paintHead(ctx, p, 0, () => {
    if (p.stripes) paintCrownStripes(ctx, p, 0);
  });
  if (face === 'yawn') {
    paintYawn(ctx, p);
    return;
  }
  paintBlush(ctx, p, [-11, 11]);
  for (const s of [-1, 1]) {
    const ex = s * 7.2;
    const ey = 1;
    if (face === 'blink') {
      // Shut, content: a cat's slow blink, as two happy arcs.
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(ex, ey + 1.8, 3.4, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      continue;
    }
    paintEye(ctx, p, ex, ey, 4.4, 4.6, 0);
    paintSparkle(ctx, ex, ey + 2, 1.1, 0.6);
    // The lid, flat across its top half: utterly unimpressed.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ex, ey, 5, 5.2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = p.fur;
    ctx.fillRect(ex - 6, ey - 6, 12, 5.7);
    ctx.restore();
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ex - 5, ey - 0.3);
    ctx.lineTo(ex + 5, ey - 0.3);
    ctx.stroke();
  }
  paintNose(ctx, p, 0, 4.6);
  paintMouth(ctx, p, 0, 5.4);
  paintWhiskers(ctx, p, [-1, 1]);
}

/** A huge yawn: eyes squeezed shut, the mouth a big round O with a little tongue. */
function paintYawn(ctx: CanvasRenderingContext2D, p: CatPalette): void {
  paintBlush(ctx, p, [-11.5, 11.5]);
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.7;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 10, -2);
    ctx.lineTo(s * 5, 0.5);
    ctx.lineTo(s * 10, 3);
    ctx.stroke();
  }
  paintNose(ctx, p, 0, 2.6);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 8.2, 4.4, 4.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8a3446';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#ff94a6';
  ctx.beginPath();
  ctx.ellipse(0, 12, 3.4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(0, 8.2, 4.4, 4.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  paintWhiskers(ctx, p, [-1, 1]);
}

/** Its head in profile, facing right, its big round eye wide open on the gift. */
function paintProfile(ctx: CanvasRenderingContext2D, p: CatPalette): void {
  // The far ear, behind.
  paintEar(ctx, p, p.shade, 3.5, -12, 11.5, -HEAD_TOP + 0.5, 15, -5, false);
  paintHead(ctx, p, 9, () => {
    if (p.stripes) {
      paintCrownStripes(ctx, p, -2);
      // And one on the back of its cheek.
      ctx.beginPath();
      ctx.moveTo(-16.5, 2);
      ctx.lineTo(-12.5, 2.6);
      ctx.stroke();
    }
  });
  // The near ear, with its pink inside.
  paintEar(ctx, p, p.fur, -15.5, -4, -8, -HEAD_TOP, -1, -12.5, true);
  paintBlush(ctx, p, [5]);
  paintEye(ctx, p, 8, 0.8, 3.8, 4.7, 1);
  paintSparkle(ctx, 8.6, 0, 1.25, 0.6);
  paintNose(ctx, p, 16.2, 3.5);
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(16.2, 4.6);
  ctx.quadraticCurveTo(15.6, 6.8, 13.8, 6.4);
  ctx.quadraticCurveTo(12.9, 6.2, 12.4, 5.4);
  ctx.stroke();
  ctx.strokeStyle = p.whisker;
  ctx.lineWidth = 0.9;
  for (const [y0, y1] of [
    [5, 3.6],
    [7, 8.4],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(14.5, y0);
    ctx.lineTo(22, y1);
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

/** Standing on all fours, its big head held up over its chest. */
const STAND: Anchors = {
  bx: -1,
  by: -16,
  rx: 16,
  ry: 11,
  rot: 0,
  sx: 8,
  sy: -11,
  hx: -10,
  hy: -11,
  headX: 15,
  headY: -32,
  frontX: 9,
  hindX: -10,
  tx: -15,
  ty: -19,
};
/** Sitting up, a round loaf with its front paws together and its haunch on the ground. */
const SIT: Anchors = {
  bx: -3,
  by: -14,
  rx: 13,
  ry: 13.5,
  rot: -1.1,
  sx: 3,
  sy: -12,
  hx: -6,
  hy: -8,
  headX: 1,
  headY: -38,
  frontX: 5,
  hindX: 1,
  tx: -13,
  ty: -5,
};
/** Crouched to pounce: front down, rear up. */
const CROUCH: Anchors = {
  bx: 0,
  by: -12,
  rx: 17,
  ry: 9.5,
  rot: 0.12,
  sx: 9,
  sy: -7,
  hx: -11,
  hy: -15,
  headX: 19,
  headY: -19,
  frontX: 15,
  hindX: -11,
  tx: -15,
  ty: -18,
};
/** Stretching: front legs out flat ahead, rear high. */
const STRETCH: Anchors = {
  bx: 0,
  by: -14,
  rx: 17,
  ry: 9,
  rot: 0.4,
  sx: 10,
  sy: -6,
  hx: -11,
  hy: -21,
  headX: 21,
  headY: -13,
  frontX: 27,
  hindX: -12,
  tx: -15,
  ty: -25,
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
const TAIL_SEGMENTS = 9;
const TAIL_STEP = 4.4;
/** How thick its stubby legs are, and its outline. */
const LEG = 7.6;
const LINE = 1.6;

/** The cat, as `look` says. */
export function drawCat(gfx: Gfx, p: CatPalette, look: CatLook): void {
  const { x, y, facing: f } = look;
  const a = anchorsOf(look.sit, look.crouch, look.stretch);
  // A little waddle as it walks, and its bounce as it runs.
  const lift = -look.bounce - Math.abs(Math.sin(look.stride)) * 1.2 * Math.min(1, look.gait);
  // The rear sways as it wiggles; the front stays put.
  a.hx += look.wiggle * 0.3;
  a.hy += Math.abs(look.wiggle) * 0.2;
  a.tx += look.wiggle;
  const X = (v: number) => x + f * v;
  const Y = (v: number) => y + v;

  gfx.ellipse(X(a.bx * 0.4), Y(1), 18 - 3 * look.sit, 3.4, 0, '#000000', { alpha: 0.22, soft: 3 });

  drawTail(gfx, p, look, a, X, Y, lift);

  // The legs: where each foot is in its stride, the far pair half a stride from the near.
  const stepAt = (phase: number) => ({
    dx: Math.sin(phase) * 5 * look.gait,
    up: Math.max(0, Math.cos(phase)) * 3.5 * look.gait,
  });
  const nearFront = stepAt(look.stride);
  const farFront = stepAt(look.stride + Math.PI);
  const nearHind = stepAt(look.stride + Math.PI);
  const farHind = stepAt(look.stride);
  const sx = a.sx;
  const sy = a.sy + lift;
  const hx = a.hx;
  const hy = a.hy + lift;

  // The far legs, in shade, then the near ones; the body sits over their tops, so they peep out from under it.
  leg(gfx, p, p.shade, X, Y, sx - 3, sy, a.frontX - 3 + farFront.dx, -farFront.up, false);
  leg(gfx, p, p.shade, X, Y, hx + 3, hy, a.hindX + 3 + farHind.dx, -farHind.up, false);
  leg(gfx, p, p.fur, X, Y, hx, hy, a.hindX + nearHind.dx, -nearHind.up, false);
  const footX = a.frontX + nearFront.dx;
  const footY = -nearFront.up;
  const r = Math.min(1, Math.max(0, look.pawReach));
  const reaching = r > 0.02;
  // Sitting, its front legs stand straight down its chest, in front of it.
  const upright = look.sit > 0.5;
  if (!reaching && !upright) leg(gfx, p, p.fur, X, Y, sx, sy, footX, footY, false);

  // The body, round and soft, with its pale belly and a tabby's two stripes across its back.
  const rot = f * a.rot;
  gfx.ellipse(X(a.bx), Y(a.by + lift), a.rx, a.ry, rot, p.fur, {
    stroke: { width: LINE, color: p.line },
  });
  const c = Math.cos(a.rot);
  const s = Math.sin(a.rot);
  const inBody = (u: number, v: number) => ({
    x: X(a.bx + u * c - v * s),
    y: Y(a.by + lift + u * s + v * c),
  });
  const belly = inBody(a.rx * 0.22, a.ry * 0.4);
  gfx.ellipse(belly.x, belly.y, a.rx * 0.6, a.ry * 0.48, rot, p.light);
  if (p.stripes) {
    for (const u of [-0.5, -0.15]) {
      const top = inBody(a.rx * u, -a.ry * 0.94);
      const end = inBody(a.rx * (u - 0.04), -a.ry * 0.45);
      gfx.line(top.x, top.y, end.x, end.y, 2.6, p.shade);
    }
  }
  // Sitting, its haunch, round on the ground, with its hind paw peeping out in front.
  const haunch = 10 * Math.min(1, look.sit * 1.3);
  if (haunch > 1) {
    gfx.circle(X(-6), Y(-9.5 + lift), haunch, p.fur, { stroke: { width: LINE, color: p.line } });
    if (p.stripes && haunch > 6) {
      gfx.line(X(-11), Y(-13), X(-7), Y(-12.5), 2.4, p.shade, { alpha: look.sit });
    }
    if (upright) paw(gfx, p, p.fur, X(a.hindX - 3), Y(-2.6), false);
  }
  if (upright && !reaching) {
    leg(gfx, p, p.fur, X, Y, sx, sy, footX, footY, false);
    gfx.circle(X(sx), Y(sy), LEG / 2 + 0.6, p.fur);
  }

  // The head pulling its face, big and round over its chest.
  gfx.sprite(headSprite(p, look.face), {
    x: X(a.headX),
    y: Y(a.headY + lift),
    anchorX: HEAD_CX / HEAD_W,
    anchorY: HEAD_CY / HEAD_H,
    rotation: f * look.headTilt,
    flipX: f < 0 && look.face === 'side',
  });

  // Reaching, its near front paw comes out in front of everything, toe beans showing.
  if (reaching) {
    leg(
      gfx,
      p,
      p.fur,
      X,
      Y,
      sx,
      sy,
      footX + (look.paw.x - footX) * r,
      footY + (look.paw.y - footY) * r,
      true,
    );
    gfx.circle(X(sx), Y(sy), LEG / 2 + 0.6, p.fur);
  }
}

/** A stubby leg from its top straight to its round paw, in `color`, toe beans showing if `beans`. */
function leg(
  gfx: Gfx,
  p: CatPalette,
  color: string,
  X: (v: number) => number,
  Y: (v: number) => number,
  sx: number,
  sy: number,
  fx: number,
  fy: number,
  beans: boolean,
): void {
  gfx.line(X(sx), Y(sy), X(fx), Y(fy - 2.6), LEG + 2 * LINE, p.line);
  gfx.line(X(sx), Y(sy), X(fx), Y(fy - 2.6), LEG, color);
  paw(gfx, p, color, X(fx + 0.6), Y(fy - 2.6), beans);
}

/** A round paw at (x, y), in world px. */
function paw(gfx: Gfx, p: CatPalette, color: string, x: number, y: number, beans: boolean): void {
  gfx.ellipse(x, y, 4.6, 3.5, 0, color, { stroke: { width: LINE, color: p.line } });
  if (beans) {
    gfx.circle(x, y + 0.6, 1.5, p.ear);
    for (const dx of [-2, 0, 2]) gfx.circle(x + dx, y - 1.6, 0.75, p.ear);
  }
}

/** Its fluffy tail: proudly up in a curl, flat out as it runs, or curled round its feet as it sits. */
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
  toward(-Math.PI / 2 - 0.3, 0.1, look.tailUp);
  toward(Math.PI + 0.12, -0.02, look.tailFlat);
  toward(Math.PI * 0.6, -0.3, look.sit);
  const points: number[] = [];
  let px = a.tx;
  let py = a.ty + lift * (1 - look.sit);
  points.push(X(px), Y(py));
  let angle = start;
  for (let k = 1; k <= TAIL_SEGMENTS; k++) {
    // A lazy swish, stronger towards the tip, and quicker as it runs.
    const swish = Math.sin(look.t * (0.004 + 0.012 * look.tailFlat) - k * 0.5) * (0.04 + 0.02 * k);
    angle += curl + swish * (1 - 0.6 * look.sit);
    px += Math.cos(angle) * TAIL_STEP;
    py = Math.min(-3, py + Math.sin(angle) * TAIL_STEP);
    points.push(X(px), Y(py));
  }
  // Plump all the way, a little fuller near the tip.
  const width = (u: number) => 6.6 + 1.4 * Math.sin(Math.PI * u * 0.8);
  gfx.ribbon(points, (u) => width(u) + 2 * LINE, p.line, { alphaFrom: 1, alphaTo: 1 });
  const n = points.length;
  gfx.circle(points[n - 2]!, points[n - 1]!, width(1) / 2 + LINE, p.line);
  gfx.ribbon(points, width, p.fur, { alphaFrom: 1, alphaTo: 1 });
  gfx.circle(points[n - 2]!, points[n - 1]!, width(1) / 2, p.fur);
  if (p.stripes) {
    // Two rings round it, and a darker tip.
    for (const k of [3, 6]) {
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
        2.4,
        p.shade,
        { cap: 'butt' },
      );
    }
    gfx.circle(points[n - 2]!, points[n - 1]!, width(1) / 2 - 0.4, p.shade);
  }
}
