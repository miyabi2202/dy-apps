import type { Gfx, Point, SpriteSource } from '../board';
import { type BuddyFace, drawBuddy } from './buddy';
import { NEON_CYAN, NEON_MAGENTA } from './neon';

// The cat, a short-haired street cat seen from the side: a slender, agile body on long legs, a
// neat head with big bright eyes and tall ears, and a long ringed tail. It wears a dark harness
// backpack with a couple of badges on it, and its drone buddy rides in the backpack
// (`buddy.ts`). It is out at night in a neon-lit city, so a cyan light catches its back and a
// magenta one its front. Its head is Canvas2D, painted once for each face it pulls
// (`headSprite`); its body, legs, tail and backpack are drawn each frame with plain `Gfx`
// calls, so it can walk, sit, crouch, stretch and paw at things. Everything here is in its own
// frame, in world pixels, facing right, with its origin on the ground between its feet, y down.

/** A cat's coat: its fur, the shade of its far side, its stripes, its cream muzzle and chest, its outline, and its face's colours. */
export interface CatPalette {
  /** Unique among the palettes, for the sprites' keys. */
  key: string;
  fur: string;
  /** Its far legs, in the shadow of its body. */
  shade: string;
  /** A tabby's stripes. */
  stripe: string;
  /** Its muzzle, chest and belly. */
  light: string;
  /** Its outline: a deep tone of its coat (lighter than the coat on the black cat, so it shows on a dark stream). */
  line: string;
  /** Its eyes: the rim of the iris, and the warmer middle round the pupil. */
  eye: string;
  eyeCore: string;
  nose: string;
  /** Inside its ears, and its toe beans. */
  ear: string;
  /** Its whiskers, which have to show against its fur. */
  whisker: string;
  /** Whether it is a tabby, striped on its head, back, legs and tail. */
  stripes: boolean;
}

export const CAT_PALETTES: readonly CatPalette[] = [
  // The ginger tabby, the hero: darker orange stripes, a cream muzzle and chest, green-gold eyes.
  {
    key: 'ginger',
    fur: '#f29a4a',
    shade: '#cf7735',
    stripe: '#c0581f',
    light: '#fbe4c4',
    line: '#5c2e16',
    eye: '#9fcb3c',
    eyeCore: '#f2bb3c',
    nose: '#ef8a8e',
    ear: '#f6a59f',
    whisker: 'rgba(255, 246, 230, 0.9)',
    stripes: true,
  },
  // Now and then a black cat instead, with bright green eyes, outlined in lavender so it shows on a dark stream.
  {
    key: 'black',
    fur: '#302e3a',
    shade: '#23212b',
    stripe: '#302e3a',
    light: '#4d4a5c',
    line: '#9a95b8',
    eye: '#86dd4e',
    eyeCore: '#e3e45a',
    nose: '#d9798f',
    ear: '#b97489',
    whisker: 'rgba(235, 232, 250, 0.85)',
    stripes: false,
  },
];

/** The dark of its pupils. */
const PUPIL = '#1d1820';

/** The faces it pulls: in profile, staring straight at the viewer, a slow blink, and a yawn. */
export type Face = 'side' | 'front' | 'blink' | 'yawn';
const FACES: readonly Face[] = ['side', 'front', 'blink', 'yawn'];

/** The painted head, and where its middle is in it. */
const HEAD_W = 44;
const HEAD_H = 42;
const HEAD_CX = 22;
const HEAD_CY = 23;
/** How far above its head's middle the tips of its ears are. */
export const HEAD_TOP = 19;
/** How thick its head's outline is. */
const HEAD_LINE = 1.25;

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

/** Its head from the front, broad at the cheeks and narrower at the crown, added to the path round (0, 0). */
function frontPath(ctx: CanvasRenderingContext2D): void {
  ctx.moveTo(0, -9.5);
  ctx.bezierCurveTo(7, -9.5, 11.4, -6.2, 11.8, 0.2);
  // A little tuft at each cheek.
  ctx.lineTo(13, 2.4);
  ctx.lineTo(11.6, 3.4);
  ctx.bezierCurveTo(10.8, 7.4, 6.4, 9.6, 0, 9.6);
  ctx.bezierCurveTo(-6.4, 9.6, -10.8, 7.4, -11.6, 3.4);
  ctx.lineTo(-13, 2.4);
  ctx.lineTo(-11.8, 0.2);
  ctx.bezierCurveTo(-11.4, -6.2, -7, -9.5, 0, -9.5);
  ctx.closePath();
}

/** Its head in profile, facing right: a round skull, a short muzzle and a little chin, added to the path round (0, 0). */
function profilePath(ctx: CanvasRenderingContext2D): void {
  ctx.moveTo(-10.4, -1.5);
  ctx.bezierCurveTo(-10.4, -7.6, -4.6, -10, 1.6, -9.6);
  ctx.bezierCurveTo(6.8, -9.2, 9.8, -5.6, 10.8, -2);
  ctx.bezierCurveTo(11.8, -0.8, 13.2, 0.8, 13.1, 2.4);
  ctx.bezierCurveTo(13, 4.2, 11.8, 5, 10.4, 5.4);
  ctx.bezierCurveTo(9.6, 7.6, 6.4, 9.2, 2.4, 9.2);
  ctx.bezierCurveTo(-3.6, 9.4, -8.6, 7.4, -10, 4);
  ctx.lineTo(-11.4, 2.6);
  ctx.closePath();
}

/**
 * The head filled and outlined, with the neon catching its edges (cyan behind, magenta in
 * front), and `inside` (its muzzle, stripes and the like) drawn clipped to it.
 */
function paintHead(
  ctx: CanvasRenderingContext2D,
  p: CatPalette,
  path: (ctx: CanvasRenderingContext2D) => void,
  inside: () => void,
): void {
  ctx.fillStyle = p.fur;
  ctx.beginPath();
  path(ctx);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.clip();
  // A soft shadow under its jaw.
  ctx.fillStyle = 'rgba(70, 20, 40, 0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  inside();
  paintRims(ctx, path);
  ctx.restore();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = HEAD_LINE;
  ctx.beginPath();
  path(ctx);
  ctx.stroke();
}

/** The neon on the edges of a shape, clipped to it already: what of it is left uncovered by itself moved a little away from each light. */
function paintRims(
  ctx: CanvasRenderingContext2D,
  path: (ctx: CanvasRenderingContext2D) => void,
): void {
  for (const [dx, dy, color, alpha] of [
    [1.8, 0.9, NEON_CYAN, 0.85],
    [-1.5, -0.2, NEON_MAGENTA, 0.7],
  ] as const) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.rect(-40, -40, 80, 80);
    ctx.translate(dx, dy);
    path(ctx);
    ctx.fill('evenodd');
    ctx.restore();
  }
}

/** A tall, pointed ear: its base from (x0, y0) to (x1, y1), its tip at (tx, ty), with a pink inside if `inner`. */
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
    // Up its sides, bowing out a little, and only just rounded at its tip.
    const round = 0.14;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(
      (ax + cx) / 2 - (cy - ay) * 0.08,
      (ay + cy) / 2 + (cx - ax) * 0.08,
      cx + (ax - cx) * round,
      cy + (ay - cy) * round,
    );
    ctx.quadraticCurveTo(cx, cy, cx + (bx - cx) * round, cy + (by - cy) * round);
    ctx.quadraticCurveTo(
      (bx + cx) / 2 + (cy - by) * 0.08,
      (by + cy) / 2 - (cx - bx) * 0.08,
      bx,
      by,
    );
    ctx.closePath();
  };
  ctx.fillStyle = fill;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = HEAD_LINE;
  earPath(1);
  ctx.fill();
  ctx.stroke();
  if (inner) {
    ctx.fillStyle = p.ear;
    earPath(0.6);
    ctx.fill();
    // A few pale tufts of fur inside.
    ctx.strokeStyle = p.light;
    ctx.lineWidth = 0.7;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    for (const k of [-0.18, 0.18]) {
      ctx.beginPath();
      ctx.moveTo(mx + (x1 - x0) * k, my + (y1 - y0) * k);
      ctx.lineTo(mx + (tx - mx) * 0.45 + (x1 - x0) * k * 0.4, my + (ty - my) * 0.45);
      ctx.stroke();
    }
  }
}

/** Short strokes of a tabby's stripes, each [x0, y0, x1, y1]. */
function paintStripes(
  ctx: CanvasRenderingContext2D,
  p: CatPalette,
  width: number,
  strokes: readonly (readonly [number, number, number, number])[],
): void {
  if (!p.stripes) return;
  ctx.strokeStyle = p.stripe;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1] of strokes) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

/** Its small pink nose, a rounded triangle with its point down at (x, y). */
function paintNose(ctx: CanvasRenderingContext2D, p: CatPalette, x: number, y: number): void {
  ctx.fillStyle = p.nose;
  ctx.strokeStyle = p.nose;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x - 1.5, y - 1.2);
  ctx.lineTo(x + 1.5, y - 1.2);
  ctx.lineTo(x, y + 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** A big bright eye at (x, y), `rx` by `ry`: its green-gold iris, and a tall pupil looking `look` px forward. */
function paintEye(
  ctx: CanvasRenderingContext2D,
  p: CatPalette,
  x: number,
  y: number,
  rx: number,
  ry: number,
  look: number,
): void {
  const iris = ctx.createRadialGradient(x + look, y, 0, x, y, Math.max(rx, ry));
  iris.addColorStop(0, p.eyeCore);
  iris.addColorStop(0.55, p.eyeCore);
  iris.addColorStop(1, p.eye);
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PUPIL;
  ctx.beginPath();
  ctx.ellipse(x + look, y + ry * 0.04, rx * 0.5, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PUPIL;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Its catchlights: a big one up and to the right, a small one down and to the left.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + rx * 0.3, y - ry * 0.38, Math.min(rx, ry) * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - rx * 0.32, y + ry * 0.42, Math.min(rx, ry) * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

/** Its little mouth under its nose at (x, y). */
function paintMouth(ctx: CanvasRenderingContext2D, p: CatPalette, x: number, y: number): void {
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - 2.4, y + 0.6);
  ctx.quadraticCurveTo(x - 1.2, y + 2, x, y);
  ctx.quadraticCurveTo(x + 1.2, y + 2, x + 2.4, y + 0.6);
  ctx.stroke();
}

/** Two fine whiskers a side, out past its cheeks. */
function paintWhiskers(
  ctx: CanvasRenderingContext2D,
  p: CatPalette,
  sides: readonly number[],
): void {
  ctx.strokeStyle = p.whisker;
  ctx.lineWidth = 0.7;
  for (const s of sides) {
    for (const [y0, y1] of [
      [4.6, 3],
      [6, 7.4],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(s * 6.5, y0);
      ctx.lineTo(s * 17, y1);
      ctx.stroke();
    }
  }
}

/**
 * Its face from the front, as it turns to look at the viewer: tall ears up, a tabby's 'M' on
 * its brow, and eyes that depend on `face`. Staring, they are big and bright under flat,
 * half-shut lids: deadpan, and still charming.
 */
export function paintFace(ctx: CanvasRenderingContext2D, p: CatPalette, face: Face): void {
  for (const s of [-1, 1])
    paintEar(ctx, p, p.fur, s * 2.8, -8.4, s * 10.6, -HEAD_TOP, s * 11.8, -2.2, true);
  paintHead(ctx, p, frontPath, () => {
    // The cream muzzle and chin.
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.ellipse(-2.6, 5.4, 4.2, 3.6, 0, 0, Math.PI * 2);
    ctx.ellipse(2.6, 5.4, 4.2, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 8.6, 4.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    paintStripes(ctx, p, 1.3, [
      [-3.4, -9.8, -2.5, -5.8],
      [0, -10.2, 0, -5.2],
      [3.4, -9.8, 2.5, -5.8],
      [-6.6, -8.8, -5.2, -6.4],
      [6.6, -8.8, 5.2, -6.4],
    ]);
    for (const s of [-1, 1]) {
      paintStripes(ctx, p, 1.1, [
        [s * 12.6, 0, s * 8.8, 1],
        [s * 12.2, 3.2, s * 9, 3.6],
      ]);
    }
  });
  if (face === 'yawn') {
    paintYawn(ctx, p);
    return;
  }
  for (const s of [-1, 1]) {
    const ex = s * 5;
    const ey = -0.6;
    if (face === 'blink') {
      // Shut, content: a cat's slow blink, as two happy arcs.
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ex, ey + 1.6, 2.8, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      continue;
    }
    paintEye(ctx, p, ex, ey, 3.3, 3.7, 0);
    // The lid, flat across its top half: utterly unimpressed.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ex, ey, 3.9, 4.3, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = p.fur;
    ctx.fillRect(ex - 5, ey - 5, 10, 4.6);
    ctx.restore();
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ex - 3.8, ey - 0.4);
    ctx.lineTo(ex + 3.8, ey - 0.4);
    ctx.stroke();
  }
  paintNose(ctx, p, 0, 3.6);
  paintMouth(ctx, p, 0, 4.3);
  paintWhiskers(ctx, p, [-1, 1]);
}

/** A huge yawn: eyes squeezed shut, the mouth a big round O with a little tongue. */
function paintYawn(ctx: CanvasRenderingContext2D, p: CatPalette): void {
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.4;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 7.5, -2.6);
    ctx.lineTo(s * 3.6, -0.6);
    ctx.lineTo(s * 7.5, 1.4);
    ctx.stroke();
  }
  paintNose(ctx, p, 0, 2);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 6, 3.4, 3.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#7c2c3e';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#ff94a6';
  ctx.beginPath();
  ctx.ellipse(0, 9, 2.6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Its little fangs.
  ctx.fillStyle = '#ffffff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 2.4, 2.8);
    ctx.lineTo(s * 1.4, 2.8);
    ctx.lineTo(s * 1.9, 4.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(0, 6, 3.4, 3.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  paintWhiskers(ctx, p, [-1, 1]);
}

/** Its head in profile, facing right, its big bright eye wide open on the gift. */
function paintProfile(ctx: CanvasRenderingContext2D, p: CatPalette): void {
  // The far ear, behind.
  paintEar(ctx, p, p.shade, 1.2, -9.2, 4.6, -HEAD_TOP + 1, 7.4, -6.4, false);
  paintHead(ctx, p, profilePath, () => {
    // The cream muzzle and chin.
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.ellipse(9.6, 4, 4.8, 3.6, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(5.5, 8.4, 5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    paintStripes(ctx, p, 1.3, [
      [-1.6, -10, -1.2, -6.2],
      [1.8, -10, 1.6, -6.4],
      [-5, -9, -4.2, -5.6],
      [-8.4, -5.4, -6.4, -3.6],
    ]);
    paintStripes(ctx, p, 1.1, [
      [-11, -0.4, -4.4, 0.4],
      [-10.6, 2.8, -4.8, 3],
    ]);
  });
  // The near ear, with its pink inside.
  paintEar(ctx, p, p.fur, -6.6, -7, -3.4, -HEAD_TOP - 0.4, 0.8, -9.6, true);
  paintEye(ctx, p, 5.8, -2.2, 2.6, 3.4, 0.7);
  paintNose(ctx, p, 12.9, 2.1);
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(12.6, 3.2);
  ctx.quadraticCurveTo(12, 5.2, 10.4, 5);
  ctx.stroke();
  ctx.strokeStyle = p.whisker;
  ctx.lineWidth = 0.7;
  for (const [y0, y1] of [
    [4.4, 3],
    [5.6, 6.8],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(9.6, y0);
    ctx.lineTo(19, y1);
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

/** Standing on all fours, long-legged, its head up on its neck. */
const STAND: Anchors = {
  bx: -1,
  by: -23,
  rx: 17,
  ry: 7.4,
  rot: -0.03,
  sx: 10,
  sy: -21,
  hx: -12,
  hy: -22,
  headX: 21,
  headY: -36,
  frontX: 11,
  hindX: -12,
  tx: -17,
  ty: -25,
};
/** Sitting up straight, front legs together under its chest, its haunch on the ground. */
const SIT: Anchors = {
  bx: -3.5,
  by: -16,
  rx: 13.5,
  ry: 9,
  rot: -1.18,
  sx: 2.5,
  sy: -22,
  hx: -7,
  hy: -9,
  headX: 3,
  headY: -38,
  frontX: 4,
  hindX: -1,
  tx: -12,
  ty: -4,
};
/** Crouched to pounce: chest low, rear up. */
const CROUCH: Anchors = {
  bx: 0,
  by: -12,
  rx: 18,
  ry: 7,
  rot: 0.14,
  sx: 11,
  sy: -8,
  hx: -12,
  hy: -17,
  headX: 23,
  headY: -16,
  frontX: 17,
  hindX: -12,
  tx: -17,
  ty: -19,
};
/** The long stretch: front legs out flat ahead, chest down, rear high. */
const STRETCH: Anchors = {
  bx: 2,
  by: -14,
  rx: 19,
  ry: 6.6,
  rot: 0.42,
  sx: 14,
  sy: -5,
  hx: -11,
  hy: -24,
  headX: 25,
  headY: -12,
  frontX: 33,
  hindX: -13,
  tx: -16,
  ty: -27,
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
  /** What its drone buddy's screen shows, and how far it has risen out of the backpack to hover (0 to 1). */
  buddy: BuddyFace;
  buddyLift: number;
  /** The frame's time in ms, for the tail's swish and the buddy's bob. */
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
  buddy: 'idle',
  buddyLift: 0,
  t: 0,
};

/** Where a point of its own frame is in the world, for a cat drawn as `look` says. */
export function catToWorld(look: CatLook, local: Point): Point {
  return { x: look.x + look.facing * local.x, y: look.y + local.y };
}

/** The tail's segments, and how long each is. */
const TAIL_SEGMENTS = 12;
const TAIL_STEP = 3.5;
/** How thick its legs are, upper and lower, and its outline. */
const FORELEG = 4.4;
const THIGH = 7.6;
const SHIN = 4;
const LINE = 1.25;
/** The backpack: its size, and where it sits on its back (along its body, and down from the top of it). */
const PACK_W = 17;
const PACK_H = 9.5;
/** Its drone buddy is drawn this much smaller than painted, and sinks this far down into the backpack. */
const BUDDY_SCALE = 0.72;
const BUDDY_SINK = 2.4;
const PACK_U = -0.1;
const PACK_DOWN = 3.4;
const PACK = '#30333b';
const PACK_FLAP = '#474c57';
const PACK_LINE = '#121318';
const STRAP = '#24262d';
/** Its badges: where each is on the backpack's side, and its colour. */
const BADGES: readonly (readonly [number, number, number, string])[] = [
  [-4.6, 1.4, 1.7, '#ffd23f'],
  [0, 1.8, 1.45, '#ff5fb8'],
  [4.2, 1.2, 1.3, '#6dff9c'],
];

/** The cat, as `look` says. */
export function drawCat(gfx: Gfx, p: CatPalette, look: CatLook): void {
  const { x, y, facing: f } = look;
  const a = anchorsOf(look.sit, look.crouch, look.stretch);
  // A light step as it walks, and its bounce as it runs.
  const lift = -look.bounce - Math.abs(Math.sin(look.stride)) * 1.1 * Math.min(1, look.gait);
  // The rear sways as it wiggles; the front stays put.
  a.hx += look.wiggle * 0.3;
  a.hy += Math.abs(look.wiggle) * 0.2;
  a.tx += look.wiggle;
  const X = (v: number) => x + f * v;
  const Y = (v: number) => y + v;

  gfx.ellipse(X(a.bx * 0.4), Y(1), 19 - 5 * look.sit, 3, 0, '#000000', { alpha: 0.24, soft: 3 });

  drawTail(gfx, p, look, a, X, Y, lift);

  // The legs: where each foot is in its stride, the far pair half a stride from the near.
  const stepAt = (phase: number) => ({
    dx: Math.sin(phase) * 5.5 * look.gait,
    up: Math.max(0, Math.cos(phase)) * 4 * look.gait,
  });
  const nearFront = stepAt(look.stride);
  const farFront = stepAt(look.stride + Math.PI);
  const nearHind = stepAt(look.stride + Math.PI);
  const farHind = stepAt(look.stride);
  const sx = a.sx;
  const sy = a.sy + lift;
  const hx = a.hx;
  const hy = a.hy + lift;
  const upright = look.sit > 0.5;

  // The far legs, in shade, behind its body.
  foreleg(gfx, p, p.shade, X, Y, sx - 2.5, sy, a.frontX - 2.5 + farFront.dx, -farFront.up, false);
  if (!upright) hindleg(gfx, p, p.shade, X, Y, hx + 3, hy, a.hindX + 3 + farHind.dx, -farHind.up);

  // Its body, chest and neck as one, outlined all round, with the neon catching its back and chest.
  const rot = f * a.rot;
  const by = a.by + lift;
  const headX = a.headX;
  const headY = a.headY + lift;
  const neck = [X(sx + 1.5), Y(sy - 2.5), X(headX - 2.5 * (1 - look.sit)), Y(headY + 5)] as const;
  const chest = { x: X(sx + 0.5), y: Y(sy + 0.5), r: 6 };
  const rump = { x: X(hx + 1), y: Y(hy - 0.5), r: 6.4 };
  gfx.ellipse(X(a.bx) - f * 1.4, Y(by) - 1.5, a.rx + 0.8, a.ry + 0.9, rot, NEON_CYAN, {
    alpha: 0.7,
    soft: 1.2,
  });
  gfx.ellipse(X(a.bx) + f * 1.4, Y(by) + 0.9, a.rx + 0.6, a.ry + 0.6, rot, NEON_MAGENTA, {
    alpha: 0.6,
    soft: 1.2,
  });
  const neckW = 8 + 2 * look.sit;
  gfx.line(neck[0], neck[1], neck[2], neck[3], neckW + 2 * LINE, p.line);
  gfx.circle(chest.x, chest.y, chest.r + LINE, p.line);
  gfx.circle(rump.x, rump.y, rump.r + LINE, p.line);
  gfx.ellipse(X(a.bx), Y(by), a.rx + LINE, a.ry + LINE, rot, p.line);
  gfx.line(neck[0], neck[1], neck[2], neck[3], neckW, p.fur);
  gfx.circle(chest.x, chest.y, chest.r, p.fur);
  gfx.circle(rump.x, rump.y, rump.r, p.fur);
  gfx.ellipse(X(a.bx), Y(by), a.rx, a.ry, rot, p.fur);

  const c = Math.cos(a.rot);
  const s = Math.sin(a.rot);
  const inBody = (u: number, v: number) => ({
    x: X(a.bx + u * c - v * s),
    y: Y(by + u * s + v * c),
  });
  // Its cream belly and chest.
  const belly = inBody(a.rx * 0.18, a.ry * 0.55);
  gfx.ellipse(belly.x, belly.y, a.rx * 0.55, a.ry * 0.4, rot, p.light);
  gfx.ellipse(X(sx + 3.6), Y(sy + 0.5), 3.4, 4.6, f * 0.3, p.light);
  // A tabby's stripes across its back, each side of the backpack.
  if (p.stripes) {
    for (const u of [-0.88, -0.66, 0.42, 0.64]) {
      const top = inBody(a.rx * u, -a.ry * 0.95);
      const end = inBody(a.rx * (u - 0.06), -a.ry * 0.15);
      gfx.line(top.x, top.y, end.x, end.y, 1.9, p.stripe);
    }
  }

  // Sitting, its haunch, round on the ground, with its hind paw peeping out in front.
  const haunch = 9.5 * Math.min(1, look.sit * 1.3);
  if (haunch > 1) {
    gfx.circle(X(-6.5), Y(-9.5 + lift), haunch, p.fur, {
      stroke: { width: LINE, color: p.line },
    });
    if (p.stripes && haunch > 6) {
      gfx.line(X(-13.5), Y(-13), X(-9.5), Y(-11.5), 1.8, p.stripe, { alpha: look.sit });
      gfx.line(X(-13), Y(-8), X(-9), Y(-7.5), 1.8, p.stripe, { alpha: look.sit });
    }
    if (upright) paw(gfx, p, p.fur, X(a.hindX), Y(-2.2), false);
  }

  // The harness: a strap round its chest and one round its belly, and the backpack on its back.
  const strap = (u0: number, u1: number) => {
    const top = inBody(a.rx * u0, -a.ry * 0.7);
    const end = inBody(a.rx * u1, a.ry * 0.92);
    gfx.line(top.x, top.y, end.x, end.y, 2.3, STRAP);
  };
  strap(0.3, 0.46);
  strap(-0.5, -0.42);
  // Sitting up, the backpack rides higher, by its shoulders, and leans back less far than its body.
  const pack = inBody(a.rx * (PACK_U + 0.22 * look.sit), -a.ry + PACK_DOWN - PACK_H / 2);
  const packRot = a.rot * (1 - 0.55 * look.sit);
  const pc = Math.cos(packRot);
  const ps = Math.sin(packRot);
  const inPack = (u: number, v: number) => ({
    x: pack.x + f * (u * pc - v * ps),
    y: pack.y + u * ps + v * pc,
  });
  const ride = look.buddyLift <= 0.3;
  // Riding, the buddy sits down in it, peeking out over its top (whichever way up it is);
  // hovering, it drifts a little back from the cat's head.
  const packTop = Math.abs(ps) * (PACK_W / 2) + Math.abs(pc) * (PACK_H / 2);
  const buddyAt = {
    x: pack.x - f * (3 * Math.min(1, look.buddyLift) + 2.5 * look.sit),
    y: pack.y - packTop + BUDDY_SINK,
  };
  const buddy = () =>
    drawBuddy(gfx, buddyAt.x, buddyAt.y, BUDDY_SCALE, look.buddy, look.buddyLift, look.t);
  if (ride) buddy();
  gfx.rect(pack.x - PACK_W / 2, pack.y - PACK_H / 2, PACK_W, PACK_H, PACK, {
    radius: 3.6,
    rotation: f * packRot,
    stroke: { width: 1.1, color: PACK_LINE },
  });
  const flap = inPack(0, -PACK_H / 2 + 2);
  gfx.rect(flap.x - PACK_W / 2 + 1, flap.y - 1.8, PACK_W - 2, 3.6, PACK_FLAP, {
    radius: 1.8,
    rotation: f * packRot,
  });
  for (const [u, v, r, color] of BADGES) {
    const at = inPack(u, v);
    gfx.circle(at.x, at.y, r, color, { stroke: { width: 0.6, color: PACK_LINE } });
  }

  // The near legs, over its body.
  if (!upright) {
    hindleg(gfx, p, p.fur, X, Y, hx, hy, a.hindX + nearHind.dx, -nearHind.up);
  }
  const footX = a.frontX + nearFront.dx;
  const footY = -nearFront.up;
  const r = Math.min(1, Math.max(0, look.pawReach));
  const reaching = r > 0.02;
  if (!reaching) foreleg(gfx, p, p.fur, X, Y, sx, sy, footX, footY, false);

  // The head pulling its face, up on its neck.
  gfx.sprite(headSprite(p, look.face), {
    x: X(headX),
    y: Y(headY),
    anchorX: HEAD_CX / HEAD_W,
    anchorY: HEAD_CY / HEAD_H,
    rotation: f * look.headTilt,
    flipX: f < 0 && look.face === 'side',
  });

  // Reaching, its near front paw comes out in front of everything, toe beans showing.
  if (reaching) {
    foreleg(
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
  }

  // Hovering, the buddy is out in front of it all.
  if (!ride) buddy();
}

/** A front leg from its shoulder straight down to its paw, in `color`, toe beans showing if `beans`; a tabby's stripes on the near ones. */
function foreleg(
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
  const px = fx + 0.8;
  const py = fy - 2.2;
  gfx.line(X(sx), Y(sy), X(px), Y(py), FORELEG + 2 * LINE, p.line);
  gfx.line(X(sx), Y(sy), X(px), Y(py), FORELEG, color);
  if (p.stripes && color === p.fur) legStripes(gfx, p, X(sx), Y(sy), X(px), Y(py), FORELEG);
  paw(gfx, p, color, X(px), Y(py), beans);
}

/** A hind leg: a strong thigh from its hip down to its hock, and a slim shin from there to its paw. */
function hindleg(
  gfx: Gfx,
  p: CatPalette,
  color: string,
  X: (v: number) => number,
  Y: (v: number) => number,
  hx: number,
  hy: number,
  fx: number,
  fy: number,
): void {
  const kx = fx - 4;
  const ky = fy - 7.5;
  const px = fx + 0.6;
  const py = fy - 2.2;
  gfx.circle(X(hx + 0.5), Y(hy + 2.5), 6.2 + LINE, p.line);
  gfx.line(X(hx), Y(hy + 2), X(kx), Y(ky), THIGH * 0.7 + 2 * LINE, p.line);
  gfx.line(X(kx), Y(ky), X(px), Y(py), SHIN + 2 * LINE, p.line);
  gfx.circle(X(hx + 0.5), Y(hy + 2.5), 6.2, color);
  gfx.line(X(hx), Y(hy + 2), X(kx), Y(ky), THIGH * 0.7, color);
  gfx.line(X(kx), Y(ky), X(px), Y(py), SHIN, color);
  if (p.stripes && color === p.fur) {
    gfx.line(X(hx - 4.5), Y(hy + 0.5), X(hx - 1.5), Y(hy + 2.5), 1.7, p.stripe);
    gfx.line(X(hx - 4), Y(hy + 4.5), X(hx - 1), Y(hy + 5.5), 1.7, p.stripe);
  }
  paw(gfx, p, color, X(px), Y(py), false);
}

/** Two stripes across a leg from (x0, y0) to (x1, y1), in world px. */
function legStripes(
  gfx: Gfx,
  p: CatPalette,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * width * 0.5;
  const ny = (dx / d) * width * 0.5;
  for (const u of [0.45, 0.68]) {
    const cx = x0 + dx * u;
    const cy = y0 + dy * u;
    gfx.line(cx - nx, cy - ny, cx + nx, cy + ny, 1.4, p.stripe, { cap: 'butt' });
  }
}

/** A neat paw at (x, y), in world px. */
function paw(gfx: Gfx, p: CatPalette, color: string, x: number, y: number, beans: boolean): void {
  gfx.ellipse(x, y, 3.2, 2.3, 0, color, { stroke: { width: LINE, color: p.line } });
  if (beans) {
    gfx.circle(x, y + 0.5, 1.1, p.ear);
    for (const dx of [-1.5, 0, 1.5]) gfx.circle(x + dx, y - 1.1, 0.55, p.ear);
  }
}

/** Its long, ringed tail: up with a hook at its tip, flat out as it runs, or curled round its feet as it sits. */
function drawTail(
  gfx: Gfx,
  p: CatPalette,
  look: CatLook,
  a: Anchors,
  X: (v: number) => number,
  Y: (v: number) => number,
  lift: number,
): void {
  // Where it starts pointing, how much it curls along its length, and how much more its tip hooks over.
  let start = Math.PI - 0.5;
  let curl = -0.04;
  let hook = 0;
  const toward = (s: number, c: number, h: number, u: number) => {
    start += (s - start) * u;
    curl += (c - curl) * u;
    hook += (h - hook) * u;
  };
  toward(-Math.PI / 2 - 0.35, 0.02, 0.32, look.tailUp);
  toward(Math.PI + 0.1, -0.015, 0, look.tailFlat);
  toward(Math.PI * 0.62, -0.24, 0, look.sit);
  const points: number[] = [];
  let px = a.tx;
  let py = a.ty + lift * (1 - look.sit);
  points.push(X(px), Y(py));
  let angle = start;
  for (let k = 1; k <= TAIL_SEGMENTS; k++) {
    const u = k / TAIL_SEGMENTS;
    // A lazy swish, stronger towards the tip, and quicker as it runs.
    const swish =
      Math.sin(look.t * (0.004 + 0.012 * look.tailFlat) - k * 0.45) * (0.03 + 0.016 * k);
    angle += curl + hook * u * u + swish * (1 - 0.6 * look.sit);
    px += Math.cos(angle) * TAIL_STEP;
    py = Math.min(-2.4, py + Math.sin(angle) * TAIL_STEP);
    points.push(X(px), Y(py));
  }
  // Slim, tapering a little to a rounded tip.
  const width = (u: number) => 4.8 - 1.2 * u;
  const n = points.length;
  const tipX = points[n - 2]!;
  const tipY = points[n - 1]!;
  // The neon catching it, then its outline, then its fur.
  gfx.ribbon(points, (u) => width(u) + 2 * LINE + 1.6, NEON_CYAN, {
    alphaFrom: 0.35,
    alphaTo: 0.35,
  });
  gfx.ribbon(points, (u) => width(u) + 2 * LINE, p.line, { alphaFrom: 1, alphaTo: 1 });
  gfx.circle(tipX, tipY, width(1) / 2 + LINE, p.line);
  gfx.ribbon(points, width, p.fur, { alphaFrom: 1, alphaTo: 1 });
  gfx.circle(tipX, tipY, width(1) / 2, p.fur);
  if (p.stripes) {
    // Rings round it, and a darker tip.
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
        1.9,
        p.stripe,
        { cap: 'butt' },
      );
    }
    const end = 2 * (TAIL_SEGMENTS - 1);
    gfx.line(points[end]!, points[end + 1]!, tipX, tipY, width(1) - 0.4, p.stripe);
    gfx.circle(tipX, tipY, width(1) / 2 - 0.2, p.stripe);
  }
}
