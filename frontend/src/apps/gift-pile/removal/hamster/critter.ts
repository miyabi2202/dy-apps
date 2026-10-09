import type { Gfx, Point, SpriteSource } from '../board';
import { type BallShape, drawBall } from './shader';

// The hamster, a round mochi of a hamster seen from the front, turned a little the way it is
// going. Its head and body are one ball of fur (`hamster/ball` in `shader.ts`), with its ears on
// top and its cheek pouches swelling out either side of its face; its feet, face, blush, paws and
// sweat are plain `Gfx` calls over it. Everything here is in its own frame, in world pixels,
// facing right with its origin on the ground between its feet, y down; `dir` mirrors it to face
// left.

/**
 * A hamster's colouring: the fur on its back, its soft outline, and the pink of its nose and
 * paws. The ball works out its own outline from the fur (about `fur × (0.74, 0.62, 0.56)`), so
 * `line` should be close to that.
 */
export interface Coat {
  fur: string;
  line: string;
  pink: string;
}

/** How much bigger it is drawn than its own frame's pixels. */
export const SCALE = 1.4;
/** Its pouch's radius before it has anything in it; the pouch grows from here. */
export const EMPTY_POUCH = 6;

/** The colour of its eyes, and of its blush. */
const EYE = '#2a1a17';
const BLUSH = '#ff8fa3';

/** Its ball, and where its face is on it. */
interface Shape extends BallShape {
  /** The ball's middle, above the ground. */
  midY: number;
  /** The middle of its eyes, from the ball's middle. */
  faceY: number;
}

/**
 * Its shape for a pouch of radius `pouch`: the fuller the pouches, the rounder the whole ball,
 * and the bigger the two pouches bulging out either side of its face, which never sink into the
 * ground.
 */
function shapeOf(pouch: number, stuffed: number): Shape {
  const g = Math.max(0, pouch - EMPTY_POUCH);
  const rx = 17 + 0.3 * g;
  const ry = 15 + 0.5 * g;
  const faceY = -0.25 * ry;
  const cheekR = 3.5 + 0.55 * g;
  return {
    rx,
    ry,
    faceX: 3.2 + 0.04 * g,
    cheekR,
    cheekDX: 7 + 0.45 * g,
    cheekY: Math.min(faceY + 4 + 0.3 * g, ry - cheekR - 0.5),
    stuffed,
    midY: -(ry + 1),
    faceY,
  };
}

/** How its eyes look. */
export type Eyes = 'dot' | 'wide' | 'shut' | 'happy';
/** How its mouth looks. */
export type Mouth = 'smile' | 'chew' | 'tight' | 'open';

/** How it is to be drawn this frame. */
export interface Look {
  /** Where the ground between its feet is, in the world. */
  x: number;
  y: number;
  /** 1 facing right, -1 facing left. */
  dir: number;
  /** Leaning forward (positive) or back, in radians. */
  tilt: number;
  /** Squashed down (below 1) or stretched up (above 1); its width goes the other way. */
  squash: number;
  /** The pouch's radius, and how stuffed it looks (0 to 1). */
  pouch: number;
  stuffed: number;
  eyes: Eyes;
  mouth: Mouth;
  /** How far open its mouth is as it chews, 0 to 1. */
  chew: number;
  /** Its front paws up at its mouth, pushing food in (0 to 1 through a push), or null if they are down. */
  paws: number | null;
  /** Where its feet are in their stride (radians), and how far they swing. */
  step: number;
  stride: number;
  /** A drop of sweat on its brow (0 to 1), and how far it has slid down. */
  sweat: number;
  slide: number;
  /** Little marks round it as it strains, 0 to 1. */
  quiver: number;
  /** The frame's time in ms, for the twitch of its nose. */
  t: number;
}

/** Where its mouth is in its own frame, under its nose. */
function mouthLocal(s: Shape): Point {
  return { x: s.faceX, y: s.midY + s.faceY + 5.2 };
}

/** Where a point of its own frame is in the world, drawn as `look` says. */
export function toWorld(local: Point, look: Look): Point {
  const sx = look.dir / look.squash;
  const sy = look.squash;
  const lx = local.x * sx * SCALE;
  const ly = local.y * sy * SCALE;
  const a = look.tilt * look.dir;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: look.x + lx * c - ly * s, y: look.y + lx * s + ly * c };
}

/** Where its mouth is in the world. */
export function mouthOf(look: Look): Point {
  return toWorld(mouthLocal(shapeOf(look.pouch, look.stuffed)), look);
}

/** Where the tops of its ears are in the world, for things over it. */
export function crownOf(look: Look): Point {
  const s = shapeOf(look.pouch, look.stuffed);
  return toWorld({ x: s.faceX * 0.5, y: s.midY - s.ry * 0.8 - (3.6 + 0.12 * s.rx) }, look);
}

/** The hamster in `coat`. */
export function drawHamster(gfx: Gfx, look: Look, coat: Coat): void {
  const { dir, squash } = look;
  const sx = dir / squash;
  const X = (x: number) => x * sx;
  const Y = (y: number) => y * squash;
  const s = shapeOf(look.pouch, look.stuffed);
  const { faceX: fx, midY } = s;
  const fy = midY + s.faceY;
  gfx.push(look.x, look.y, look.tilt * dir, SCALE);

  // The ball of it: head, body, ears and pouches.
  drawBall(gfx, 0, Y(midY), dir, squash, s, coat.fur);

  // Its tiny feet peeping out underneath, taking turns to lift as it walks.
  for (const k of [-1, 1]) {
    const lift = Math.max(0, Math.sin(look.step + (k > 0 ? 0 : Math.PI))) * 2.2 * look.stride;
    gfx.ellipse(X(fx * 0.4 + k * s.rx * 0.4), Y(-1.8 - lift), 3.4, 2.3, 0, coat.pink, {
      stroke: { width: 0.7, color: coat.line },
    });
  }

  // Rosy blush on its cheeks, bigger and rosier the fuller they are.
  for (const k of [-1, 1]) {
    gfx.ellipse(
      X(fx + k * (s.cheekDX + 1.2)),
      Y(midY + s.cheekY - s.cheekR * 0.05 + 1),
      2.6 + s.cheekR * 0.32,
      1.7 + s.cheekR * 0.18,
      0,
      BLUSH,
      { alpha: 0.45 + 0.25 * look.stuffed, soft: 1.2 + s.cheekR * 0.12 },
    );
  }

  // Its eyes, wide apart above its muzzle.
  const gap = 5.6 + 0.12 * s.cheekDX;
  const eyeR = 2.7 + 0.04 * (look.pouch - EMPTY_POUCH);
  for (const k of [-1, 1]) drawEye(gfx, fx + k * gap, fy, k, eyeR, look.eyes, X, Y);

  // A tiny pink nose, twitching, and its mouth under it.
  const twitch = Math.sin(look.t * 0.05) > 0.6 ? 0.35 : 0;
  gfx.ellipse(X(fx), Y(fy + 2.9 - twitch), 1.5, 1.1, 0, coat.pink, {
    stroke: { width: 0.55, color: coat.line },
  });
  drawMouth(gfx, mouthLocal(s), look, X, Y, coat.line);

  // Its little paws: held in front of it, or up at its mouth taking turns to push food in.
  const m = mouthLocal(s);
  for (const k of [-1, 1]) {
    let px = fx + k * (4.2 + 0.1 * s.cheekDX);
    let py = fy + 11.5 + 0.25 * s.cheekR;
    if (look.paws !== null) {
      const push = Math.sin((look.paws + (k > 0 ? 0.5 : 0)) * Math.PI * 2) * 0.5 + 0.5;
      px = m.x + k * (2.6 - push * 0.8);
      py = m.y + 4.2 - push * 2.4;
    }
    gfx.ellipse(X(px), Y(py), 2.4, 2, 0, coat.pink, {
      stroke: { width: 0.6, color: coat.line },
    });
  }

  // A drop of sweat by its ear, sliding off as it relaxes.
  if (look.sweat > 0) {
    drawSweat(gfx, X(fx + s.rx * 0.62), Y(midY - s.ry * 0.5) + look.slide * 22, look.sweat);
  }

  // Strain marks: short strokes fanning out from its top either side.
  if (look.quiver > 0) {
    const ox = s.rx + s.cheekR * 0.6 + 3;
    const oy = s.ry + 3;
    for (const a of [-2.55, -2.15, -0.99, -0.59]) {
      const ax = Math.cos(a);
      const ay = Math.sin(a);
      gfx.line(
        X(fx * 0.5 + ax * ox),
        Y(midY + ay * oy),
        X(fx * 0.5 + ax * (ox + 5)),
        Y(midY + ay * (oy + 5)),
        1.1,
        coat.line,
        { alpha: 0.85 * look.quiver },
      );
    }
  }
  gfx.pop();
}

/** One eye at (x, y) of its own frame, `side` -1 on its left and 1 on its right, as it looks. */
function drawEye(
  gfx: Gfx,
  x: number,
  y: number,
  side: number,
  r: number,
  eyes: Eyes,
  X: (x: number) => number,
  Y: (y: number) => number,
): void {
  const pts = (xy: readonly number[]) => xy.map((v, i) => (i % 2 === 0 ? X(x + v) : Y(y + v)));
  if (eyes === 'shut') {
    // Screwed shut, > <, each pointing in.
    const a = r * 0.85;
    gfx.polyline(pts([side * a, -a, -side * a * 0.8, 0, side * a, a]), 1.1, EYE);
    return;
  }
  if (eyes === 'happy') {
    // Squinting happily, ^ ^.
    const a = r * 0.95;
    gfx.polyline(
      pts([-a, a * 0.45, -a * 0.5, -a * 0.25, 0, -a * 0.45, a * 0.5, -a * 0.25, a, a * 0.45]),
      1.1,
      EYE,
    );
    return;
  }
  // Big, round and shiny, with a sparkle up on the side the light comes from.
  const rr = eyes === 'wide' ? r * 1.18 : r;
  gfx.circle(X(x), Y(y), rr, EYE);
  gfx.circle(X(x - rr * 0.32), Y(y - rr * 0.36), rr * 0.42, '#ffffff');
  gfx.circle(X(x + rr * 0.38), Y(y + rr * 0.34), rr * 0.18, '#ffffff');
}

/** Its mouth, under its nose: a little ω, chewing, pressed tight, or wide open. */
function drawMouth(
  gfx: Gfx,
  m: Point,
  look: Look,
  X: (x: number) => number,
  Y: (y: number) => number,
  line: string,
): void {
  const pts = (xy: readonly number[]) => xy.map((v, i) => (i % 2 === 0 ? X(m.x + v) : Y(m.y + v)));
  if (look.mouth === 'open') {
    gfx.ellipse(X(m.x), Y(m.y + 1.6), 2.2, 2.7, 0, '#8a3a3f', {
      stroke: { width: 0.6, color: line },
    });
    gfx.ellipse(X(m.x), Y(m.y + 3), 1.3, 0.8, 0, '#ff9aa6');
    return;
  }
  if (look.mouth === 'chew' && look.chew > 0.55) {
    gfx.ellipse(X(m.x), Y(m.y + 0.9), 1.3, 0.5 + 1.1 * look.chew, 0, '#8a3a3f', {
      stroke: { width: 0.5, color: line },
    });
    return;
  }
  if (look.mouth === 'tight') {
    gfx.polyline(pts([-2.4, 0.6, -1.2, -0.2, 0, 0.6, 1.2, -0.2, 2.4, 0.6]), 0.8, line);
    return;
  }
  // ω: a short stroke down from the nose, then two little curves.
  gfx.polyline(pts([0, -1.3, 0, -0.1]), 0.7, line);
  gfx.polyline(pts([-2.4, -0.6, -1.9, 0.5, -1.0, 0.7, -0.3, 0.3, 0, -0.1]), 0.7, line);
  gfx.polyline(pts([2.4, -0.6, 1.9, 0.5, 1.0, 0.7, 0.3, 0.3, 0, -0.1]), 0.7, line);
}

/** A drop of sweat with its point up, `alpha` seen. */
export function drawSweat(gfx: Gfx, x: number, y: number, alpha: number): void {
  gfx.polygon([x, y - 5, x + 2.4, y - 0.5, x - 2.4, y - 0.5], '#a8dcff', { alpha });
  gfx.circle(x, y, 2.6, '#a8dcff', { alpha, stroke: { width: 0.6, color: '#5c9fd6' } });
  gfx.circle(x - 0.8, y - 0.6, 0.7, '#ffffff', { alpha });
}

/** "噗！" in a white burst, for the spit: painted once. */
export const PFFT: SpriteSource = {
  key: 'hamster/pfft',
  width: 76,
  height: 52,
  paint(ctx) {
    const cx = 38;
    const cy = 26;
    ctx.lineJoin = 'round';
    // The burst behind it, spiky.
    ctx.beginPath();
    const spikes = 11;
    for (let k = 0; k < spikes * 2; k++) {
      const a = (k / (spikes * 2)) * Math.PI * 2;
      const r = k % 2 === 0 ? 1 : 0.74;
      const x = cx + Math.cos(a) * 35 * r;
      const y = cy + Math.sin(a) * 23 * r;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#d9925f';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // The word, fat and orange, outlined in warm brown.
    ctx.font = '900 26px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(cx, cy + 1);
    ctx.rotate(-0.12);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#a5562c';
    ctx.strokeText('噗！', 0, 0);
    ctx.fillStyle = '#ff8a4c';
    ctx.fillText('噗！', 0, 0);
  },
};
