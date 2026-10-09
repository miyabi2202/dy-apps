import type { Gfx, SpriteSource } from '../board';
import { NEON_CYAN } from './neon';

// The cat's drone buddy: a little round robot that rides in the backpack on its back and peeks
// or hovers up out of it, a screen for a face showing what it makes of what the cat is up to.
// Its shell and face are Canvas2D, painted once for each face (`buddySprite`); its glow and its
// hover are plain `Gfx` calls each frame (`drawBuddy`). It never turns round with the cat, so
// its face always reads the right way.

/**
 * What its screen shows: its two eyes, a blink, '?' at the cat's deadpan stares, '…', '!' at a
 * swat, '^ ^' when it is pleased, and 'z z' when the cat yawns.
 */
export type BuddyFace = 'idle' | 'blink' | 'what' | 'dots' | 'alarm' | 'happy' | 'sleep';
const BUDDY_FACES: readonly BuddyFace[] = [
  'idle',
  'blink',
  'what',
  'dots',
  'alarm',
  'happy',
  'sleep',
];

/** The painted buddy, and where its middle is in it. */
const BUDDY_W = 28;
const BUDDY_H = 28;
const BUDDY_CX = 14;
const BUDDY_CY = 15;
/** How far below its middle its shell ends, and how high it hovers out of the backpack. */
const BUDDY_BOTTOM = 8;
const HOVER = 17;

const SHELL = '#e9edf1';
const SHELL_SHADE = '#a9b3bf';
const SHELL_LINE = '#3c4450';
const SCREEN = '#0b1820';

const sprites = new Map<BuddyFace, SpriteSource>();

/** The buddy showing `face`, painted once (the same object each time it is asked for). */
export function buddySprite(face: BuddyFace): SpriteSource {
  let sprite = sprites.get(face);
  if (!sprite) {
    sprite = {
      key: `cat/buddy/${face}`,
      width: BUDDY_W,
      height: BUDDY_H,
      paint(ctx) {
        ctx.translate(BUDDY_CX, BUDDY_CY);
        paintBuddy(ctx, face);
      },
    };
    sprites.set(face, sprite);
  }
  return sprite;
}

/** Every face it has, to paint ahead of time. */
export function buddySprites(): SpriteSource[] {
  return BUDDY_FACES.map(buddySprite);
}

/**
 * The buddy round (0, 0): a rounded, pale shell with a little fin on each side and an antenna
 * with a glowing tip, and a dark screen showing `face` in glowing cyan.
 */
export function paintBuddy(ctx: CanvasRenderingContext2D, face: BuddyFace): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Its fins, behind the shell.
  ctx.fillStyle = SHELL_SHADE;
  ctx.strokeStyle = SHELL_LINE;
  ctx.lineWidth = 1.1;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 9.6, 0.8, 2, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // The antenna, its tip lit.
  ctx.strokeStyle = SHELL_LINE;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(3, -7);
  ctx.lineTo(5, -11);
  ctx.stroke();
  glowing(ctx, 3, () => {
    ctx.fillStyle = NEON_CYAN;
    ctx.beginPath();
    ctx.arc(5, -11.4, 1.4, 0, Math.PI * 2);
    ctx.fill();
  });
  // The shell, lit from above.
  const shell = ctx.createLinearGradient(0, -8, 0, 8.5);
  shell.addColorStop(0, '#ffffff');
  shell.addColorStop(0.45, SHELL);
  shell.addColorStop(1, SHELL_SHADE);
  ctx.fillStyle = shell;
  ctx.strokeStyle = SHELL_LINE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-9, -7.5, 18, 16, 6.5);
  ctx.fill();
  ctx.stroke();
  // The screen, with a faint cyan edge.
  ctx.fillStyle = SCREEN;
  ctx.beginPath();
  ctx.roundRect(-6.8, -4.6, 13.6, 9.6, 3.4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(63, 240, 255, 0.35)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // What it shows, glowing.
  glowing(ctx, 2.4, () => paintScreen(ctx, face));
}

/** Draw with `paint` glowing cyan, `blur` px of it. */
function glowing(ctx: CanvasRenderingContext2D, blur: number, paint: () => void): void {
  ctx.save();
  ctx.shadowColor = NEON_CYAN;
  ctx.shadowBlur = blur;
  paint();
  ctx.restore();
}

/** Its face on the screen round (0, 0.2), in glowing cyan strokes. */
function paintScreen(ctx: CanvasRenderingContext2D, face: BuddyFace): void {
  ctx.strokeStyle = NEON_CYAN;
  ctx.fillStyle = NEON_CYAN;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const dot = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const stroke = (width: number, ...xy: number[]) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(xy[0]!, xy[1]!);
    for (let k = 2; k < xy.length; k += 2) ctx.lineTo(xy[k]!, xy[k + 1]!);
    ctx.stroke();
  };
  switch (face) {
    case 'idle':
      for (const x of [-2.8, 2.8]) stroke(2, x, -1.4, x, 1.4);
      break;
    case 'blink':
      for (const x of [-2.8, 2.8]) stroke(1.4, x - 1.5, 0.6, x + 1.5, 0.6);
      break;
    case 'what':
      // '?': a hook over a stem, and its dot.
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, -1.5, 2, Math.PI * 1.1, Math.PI * 2.25);
      ctx.lineTo(0, 1);
      ctx.stroke();
      dot(0, 3, 0.8);
      break;
    case 'dots':
      for (const x of [-3.2, 0, 3.2]) dot(x, 1, 0.95);
      break;
    case 'alarm':
      stroke(1.8, 0, -3.1, 0, 0.9);
      dot(0, 3, 1);
      break;
    case 'happy':
      for (const x of [-2.9, 2.9]) stroke(1.4, x - 1.8, 1.1, x, -1.1, x + 1.8, 1.1);
      break;
    case 'sleep':
      // 'z z', a big one and a small one.
      stroke(1.2, -4, -0.9, -0.8, -0.9, -4, 2.6, -0.8, 2.6);
      stroke(1, 1.6, -2.6, 4, -2.6, 1.6, 0, 4, 0);
      break;
  }
}

/**
 * The buddy, `scale` times its painted size, sitting in the backpack with the bottom of its
 * shell at (x, y), risen `lift` (0 to 1) of the way up out of it to hover, bobbing, with a soft
 * cyan glow and a little thruster light under it. `t` is the frame's time in ms.
 */
export function drawBuddy(
  gfx: Gfx,
  x: number,
  y: number,
  scale: number,
  face: BuddyFace,
  lift: number,
  t: number,
): void {
  const up = Math.max(0, Math.min(1, lift));
  const bottom = BUDDY_BOTTOM * scale;
  const cy = y - bottom - up * HOVER + Math.sin(t * 0.005) * 1.3 * up;
  if (up > 0.05) {
    gfx.glow(x, cy + bottom + 2, (5 + 4 * up) * scale, NEON_CYAN, { intensity: 0.55 * up });
  }
  gfx.glow(x, cy, 15 * scale, NEON_CYAN, { intensity: 0.14 + 0.2 * up, falloff: 1.6 });
  gfx.sprite(buddySprite(face), {
    x,
    y: cy,
    width: BUDDY_W * scale,
    height: BUDDY_H * scale,
    anchorX: BUDDY_CX / BUDDY_W,
    anchorY: BUDDY_CY / BUDDY_H,
    rotation: Math.sin(t * 0.0037) * 0.09 * up,
  });
}
