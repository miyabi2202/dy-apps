import type { Gfx, Point, SpriteSource } from '../board';
import { drawFace } from './shader';

// The hamster, seen from the side. Its body is painted once with Canvas2D (`bodyOf`); what
// moves is drawn over it each frame: its feet, its head and the cheek pouch that swells under
// it (`hamster/face` in `shader.ts`), and its face, paws and sweat with plain `Gfx` calls.
// Everything here is in its own frame, in world pixels, facing right with its origin on the
// ground between its feet, y down; `dir` mirrors it to face left.

/** A hamster's colouring: the fur on its back, its outline, and the pink of its ears, nose and paws. */
export interface Coat {
  fur: string;
  line: string;
  pink: string;
}

/** The painted body, and where the ground under its middle is in it. */
const WIDTH = 66;
const HEIGHT = 48;
const ORIGIN_X = 36;
const ORIGIN_Y = 45;

/** How much bigger it is drawn than its own frame's pixels. */
export const SCALE = 1.4;
/** The head's radius, and its pouch's radius before it has anything in it. */
export const HEAD_R = 14;
export const EMPTY_POUCH = 6;
/** The pouch swells from under the head towards the top front of the ball it makes, at this angle. */
const SWELL_ANGLE = -0.7;

/** Its body, painted once: a plump back, a creamy belly and a stub of a tail. */
export function bodyOf(coat: Coat): SpriteSource {
  return {
    key: `hamster/body/${coat.fur}`,
    width: WIDTH,
    height: HEIGHT,
    paint(ctx) {
      ctx.translate(ORIGIN_X, ORIGIN_Y);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // The stub of a tail.
      ctx.fillStyle = coat.pink;
      ctx.strokeStyle = coat.line;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(-28, -12, 3.6, 2.6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // The body, a round loaf of fur, darker along the back.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(-5, -18, 25, 17.5, -0.08, 0, Math.PI * 2);
      const fur = ctx.createLinearGradient(0, -36, 0, 0);
      fur.addColorStop(0, coat.fur);
      fur.addColorStop(0.55, coat.fur);
      fur.addColorStop(1, '#fff6ea');
      ctx.fillStyle = fur;
      ctx.fill();
      ctx.clip();
      // The creamy belly, and a stripe of darker fur down the back.
      ctx.fillStyle = 'rgba(255, 250, 242, 0.95)';
      ctx.beginPath();
      ctx.ellipse(4, -6, 19, 11, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90, 50, 20, 0.16)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(-5, -18, 22, 15, -0.08, Math.PI * 1.1, Math.PI * 1.75);
      ctx.stroke();
      // Tufts of fur, and the curve of its haunch.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1.1;
      for (const [x, y] of [
        [-14, -28],
        [-6, -31],
        [3, -29],
        [-20, -21],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 2, y - 2, x + 4, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(90, 50, 20, 0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(-15, -9, 9, Math.PI * 1.05, Math.PI * 1.65);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = coat.line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(-5, -18, 25, 17.5, -0.08, 0, Math.PI * 2);
      ctx.stroke();
    },
  };
}

/** Where its head and pouch are in its own frame, for a pouch of radius `pouch`. */
export interface Head {
  headX: number;
  headY: number;
  pouchX: number;
  pouchY: number;
}

/** The head over the body, pushed up and forward as the pouch under it swells into a ball, which never sinks into the ground. */
export function headOf(pouch: number): Head {
  const pouchX = 12 + 0.3 * pouch;
  const pouchY = Math.min(-27, -4 - pouch);
  const out = Math.max(0, pouch - HEAD_R * 0.75);
  return {
    headX: pouchX + out * Math.cos(SWELL_ANGLE),
    headY: pouchY + out * Math.sin(SWELL_ANGLE),
    pouchX,
    pouchY,
  };
}

/** Where its mouth is in its own frame, under the tip of its nose. */
function mouthLocal(head: Head): Point {
  return { x: head.headX + HEAD_R * 0.82, y: head.headY + HEAD_R * 0.5 };
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
  return toWorld(mouthLocal(headOf(look.pouch)), look);
}

/** Where the top of its head is in the world, for things over it. */
export function crownOf(look: Look): Point {
  const head = headOf(look.pouch);
  return toWorld({ x: head.headX, y: Math.min(head.headY, head.pouchY) - look.pouch }, look);
}

/** The hamster in `coat`, with its body painted as `body`. */
export function drawHamster(gfx: Gfx, look: Look, coat: Coat, body: SpriteSource): void {
  const { dir, squash } = look;
  const sx = dir / squash;
  const sy = squash;
  const X = (x: number) => x * sx;
  const Y = (y: number) => y * sy;
  const head = headOf(look.pouch);
  const { headX: hx, headY: hy } = head;
  const R = HEAD_R;
  gfx.push(look.x, look.y, look.tilt * dir, SCALE);

  // Its ears, behind its head: the far one darker.
  gfx.circle(X(hx - 0.78 * R), Y(hy - 0.6 * R), 5, coat.line);
  gfx.circle(X(hx - 0.78 * R), Y(hy - 0.6 * R), 3.6, coat.pink, { alpha: 0.6 });
  gfx.circle(X(hx - 0.3 * R), Y(hy - 0.88 * R), 5.8, coat.line);
  gfx.circle(X(hx - 0.3 * R), Y(hy - 0.88 * R), 4.4, coat.fur);
  gfx.circle(X(hx - 0.28 * R), Y(hy - 0.86 * R), 2.8, coat.pink);

  // Its back foot and its body, then its front foot.
  const swing = Math.sin(look.step) * look.stride;
  gfx.ellipse(
    X(-16 - swing * 5),
    Y(-1.5 + Math.min(0, Math.cos(look.step)) * 2 * look.stride),
    5,
    2.6,
    0,
    coat.pink,
    {
      stroke: { width: 1, color: coat.line },
    },
  );
  gfx.sprite(body, {
    x: 0,
    y: 0,
    anchorX: ORIGIN_X / WIDTH,
    anchorY: ORIGIN_Y / HEIGHT,
    flipX: dir < 0,
    scaleX: 1 / squash,
    scaleY: squash,
  });
  gfx.ellipse(
    X(8 + swing * 5),
    Y(-1.5 - Math.max(0, Math.cos(look.step)) * 2 * look.stride),
    4.6,
    2.5,
    0,
    coat.pink,
    {
      stroke: { width: 1, color: coat.line },
    },
  );

  // The head and its pouch, as one ball of fur.
  drawFace(
    gfx,
    {
      headX: X(hx),
      headY: Y(hy),
      headR: R,
      pouchX: X(head.pouchX),
      pouchY: Y(head.pouchY),
      pouchR: look.pouch,
      stuffed: look.stuffed,
      seed: 3.7,
    },
    coat.fur,
  );
  // Rosy cheeks, rosier the fuller they are.
  gfx.ellipse(
    X(head.pouchX + look.pouch * 0.45),
    Y(head.pouchY + look.pouch * 0.2),
    3 + look.pouch * 0.32,
    2 + look.pouch * 0.2,
    0,
    '#ff8fa3',
    { alpha: 0.22 + 0.3 * look.stuffed, soft: 2 + look.pouch * 0.12 },
  );
  drawEye(gfx, X(hx + 0.4 * R), Y(hy - 0.2 * R), look.eyes, dir, coat.line);

  // The nose, twitching, and whiskers either side of it.
  const twitch = Math.sin(look.t * 0.05) > 0.6 ? 0.6 : 0;
  const noseX = X(hx + 0.98 * R);
  const noseY = Y(hy + 0.12 * R) - twitch;
  for (const k of [-1, 0, 1]) {
    gfx.line(noseX - dir * 3, noseY + 2, noseX + dir * 9, noseY + 2 + k * 3.4 - 1, 0.7, coat.line, {
      alpha: 0.65,
    });
  }
  gfx.circle(noseX, noseY, 2.1, coat.pink, { stroke: { width: 0.8, color: coat.line } });
  drawMouth(gfx, mouthLocal(head), look, X, Y, coat.line);

  // Its front paws up at its mouth, taking turns to push food in.
  if (look.paws !== null) {
    const m = mouthLocal(head);
    for (const k of [0, 1]) {
      const push = Math.sin((look.paws + k * 0.5) * Math.PI * 2) * 0.5 + 0.5;
      gfx.ellipse(
        X(m.x - 2 + push * 3 - k * 4),
        Y(m.y + 6 - push * 3 + k * 1.5),
        3.4,
        2.6,
        0.5 * dir,
        coat.pink,
        { stroke: { width: 0.9, color: coat.line } },
      );
    }
  }

  // A drop of sweat on its brow, sliding off as it relaxes.
  if (look.sweat > 0) {
    const sx0 = X(hx - 0.55 * R);
    const sy0 = Y(hy - 0.95 * R) + look.slide * 26;
    drawSweat(gfx, sx0, sy0, look.sweat);
  }

  // Strain marks behind it: three short strokes fanning out from the ball.
  if (look.quiver > 0) {
    const cx = X(head.pouchX);
    const cy = Y(head.pouchY);
    const r = look.pouch + 6;
    for (const a of [-2.3, -1.9, -2.7]) {
      const ax = Math.cos(a) * dir;
      const ay = Math.sin(a);
      gfx.line(cx + ax * r, cy + ay * r, cx + ax * (r + 7), cy + ay * (r + 7), 1.6, coat.line, {
        alpha: 0.8 * look.quiver,
      });
    }
  }
  gfx.pop();
}

/** Its eye at (x, y), as it looks. */
function drawEye(gfx: Gfx, x: number, y: number, eyes: Eyes, dir: number, line: string): void {
  if (eyes === 'shut') {
    // Screwed shut: a > (or < facing left).
    gfx.polyline([x - dir * 2.6, y - 2.6, x + dir * 1.8, y, x - dir * 2.6, y + 2.6], 1.5, line);
    return;
  }
  if (eyes === 'happy') {
    // Squinting happily: an upturned arc.
    gfx.polyline([x - 3, y + 1, x - 1.5, y - 1.4, x + 1.5, y - 1.4, x + 3, y + 1], 1.5, line);
    return;
  }
  const r = eyes === 'wide' ? 3.6 : 2.9;
  gfx.circle(x, y, r, '#1a0f0a');
  gfx.circle(x + dir * 0.9, y - 1.1, r * 0.38, '#ffffff');
  if (eyes === 'wide') gfx.circle(x - dir * 1.1, y + 1.2, r * 0.18, '#ffffff');
}

/** Its mouth, under its nose: a little w, chewing, pressed tight, or wide open. */
function drawMouth(
  gfx: Gfx,
  m: Point,
  look: Look,
  X: (x: number) => number,
  Y: (y: number) => number,
  line: string,
): void {
  const x = X(m.x);
  const y = Y(m.y);
  const d = look.dir;
  if (look.mouth === 'open') {
    gfx.ellipse(x, y + 1, 3.6, 4.4, 0, '#5a1f1f', { stroke: { width: 1, color: line } });
    gfx.ellipse(x, y + 3.4, 2, 1.2, 0, '#ff8f9a');
    return;
  }
  if (look.mouth === 'chew' && look.chew > 0.15) {
    gfx.ellipse(x, y + 0.5, 2.4, 1 + 2.2 * look.chew, 0, '#5a1f1f', {
      stroke: { width: 0.9, color: line },
    });
    return;
  }
  if (look.mouth === 'tight') {
    gfx.polyline([x - d * 3, y, x - d * 1.5, y - 0.8, x, y, x + d * 1.5, y - 0.8], 1.1, line);
    return;
  }
  gfx.polyline(
    [x - d * 3, y - 0.5, x - d * 1.5, y + 0.9, x, y - 0.3, x + d * 1.2, y + 0.9],
    1,
    line,
  );
}

/** A drop of sweat with its point up, `alpha` seen. */
export function drawSweat(gfx: Gfx, x: number, y: number, alpha: number): void {
  gfx.polygon([x, y - 6.5, x + 3.1, y - 0.6, x - 3.1, y - 0.6], '#9fd8ff', { alpha });
  gfx.circle(x, y, 3.4, '#9fd8ff', { alpha, stroke: { width: 0.8, color: '#3d86c6' } });
  gfx.circle(x - 1.1, y - 0.8, 0.9, '#ffffff', { alpha });
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
      const r = k % 2 === 0 ? 1 : 0.72;
      const x = cx + Math.cos(a) * 35 * r;
      const y = cy + Math.sin(a) * 23 * r;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#7a4320';
    ctx.lineWidth = 2;
    ctx.stroke();
    // The word, fat and orange, outlined in brown.
    ctx.font = '900 26px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(cx, cy + 1);
    ctx.rotate(-0.12);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#7a4320';
    ctx.strokeText('噗！', 0, 0);
    ctx.fillStyle = '#ff7a3d';
    ctx.fillText('噗！', 0, 0);
  },
};
