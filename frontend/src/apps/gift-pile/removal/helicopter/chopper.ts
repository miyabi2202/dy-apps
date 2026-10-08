// Drawing the helicopter: the Fluent Emoji art, mirrored to face right, with its rotors
// drawn turning over it. Geometry in world pixels, times in ms.

import type { Gfx, Point } from '../board';
import type { Recolour, SvgArt } from '../kit/svg-art';

const SIZE = 76;
/** The middle of the cabin, in the art's 32×32 view box, which faces left. */
const CX = 14;
const CY = 17;
/** From the cabin's middle to the winch under the skids, where the rope comes down. */
export const WINCH: Point = { x: 2, y: 27 };
/**
 * The rotors, in the art's view box: the main rotor's hub atop the mast and its blades'
 * reach, seen edge on; the tail rotor's hub and its blades' reach, seen face on. The art's
 * own grey for the blades, and how fast each turns, in radians per ms.
 */
const MAIN_HUB = { x: 12.5, y: 7.2 };
const MAIN_REACH = 10;
const TAIL_HUB = { x: 27, y: 12 };
const TAIL_REACH = 3.4;
const BLADE = '#B4ACBC';
/** Where the rotor's hub is from the cabin's middle, and how far its blades reach, world px (before tilt). */
export const ROTOR: Point = { x: (CX - 12.5) * (SIZE / 32), y: (7.2 - CY) * (SIZE / 32) };
export const ROTOR_REACH = MAIN_REACH * (SIZE / 32);
/** Where the belly is, under the cabin, where the searchlight shines from. */
export const BELLY: Point = { x: 4, y: 17 };
const MAIN_SPIN = 0.045;
const TAIL_SPIN = 0.06;

/** World px per unit of the art's view box. */
const K = SIZE / 32;

/** Where a point of the art's view box is, relative to the cabin's middle: the art faces left and is mirrored to face right. */
function onChopper(vx: number, vy: number): Point {
  return { x: (CX - vx) * K, y: (vy - CY) * K };
}

/** The helicopter in `scheme`, its cabin's middle at `at`, turned by `tilt` (positive: nose down), `t` ms in. */
export function drawChopper(
  gfx: Gfx,
  art: SvgArt,
  scheme: Recolour,
  at: Point,
  tilt: number,
  t: number,
): void {
  gfx.push(at.x, at.y, tilt);
  gfx.sprite(art.sprite(scheme), {
    x: 0,
    y: 0,
    width: SIZE,
    height: SIZE,
    anchorX: CX / 32,
    anchorY: CY / 32,
    flipX: true,
    material: { kind: 'metal', strength: 0.6 },
  });
  // A cool rim light along its top, as from the sky.
  gfx.sprite(art.sprite(scheme), {
    x: 0,
    y: 0,
    width: SIZE,
    height: SIZE,
    anchorX: CX / 32,
    anchorY: CY / 32,
    flipX: true,
    alpha: 0.55,
    blend: 'add',
    material: { kind: 'rim', color: '#bae6fd', width: 2 },
  });
  drawRotors(gfx, t);
  drawLights(gfx, t);
  gfx.pop();
}

/** Red on the tail, green on the nose, and a white strobe on the mast: twice every 1.5 s. */
function drawLights(gfx: Gfx, t: number): void {
  const tail = onChopper(28.5, 9);
  const nose = onChopper(3.5, 19);
  const mast = onChopper(12.5, 5);
  const blink = Math.sin((t / 1000) * Math.PI * 2) > 0 ? 1 : 0.15;
  gfx.glow(tail.x, tail.y, 7, '#ef4444', { intensity: 1.3 * blink });
  gfx.glow(nose.x, nose.y, 6, '#22c55e', { intensity: 1.1 });
  const phase = t % 1500;
  if (phase < 60 || (phase > 240 && phase < 300)) {
    gfx.glow(mast.x, mast.y, 12, '#ffffff', { intensity: 1.6 });
  }
}

/**
 * The rotors `t` ms in. The main rotor's blades, seen edge on, sweep out and back as they
 * turn, over the faint disc they blur into, with streaks where each has just been; the
 * tail rotor's turn face on inside a ring.
 */
function drawRotors(gfx: Gfx, t: number): void {
  const main = onChopper(MAIN_HUB.x, MAIN_HUB.y);
  const reachPx = MAIN_REACH * K;
  // The disc, tilted nearly edge on: a flattened ellipse with a bright sweep turning in it.
  gfx.ellipse(main.x, main.y, reachPx, 0.16 * reachPx, 0, '#cbd5e1', { alpha: 0.18, blend: 'add' });
  const sweep = (t * MAIN_SPIN) % (Math.PI * 2);
  const reach = reachPx * Math.abs(Math.cos(sweep));
  // Blade streaks: where the blade has just been.
  for (let k = 1; k <= 3; k++) {
    const r = reachPx * Math.abs(Math.cos(sweep - k * 0.35));
    gfx.rect(main.x - r, main.y - 0.6 * K, 2 * r, 1.2 * K, '#e2e8f0', {
      radius: 0.6 * K,
      alpha: 0.16 / k,
      blend: 'add',
    });
  }
  if (reach > 0.2) {
    gfx.rect(main.x - reach, main.y - 0.9 * K, 2 * reach, 1.8 * K, BLADE, { radius: 0.9 * K });
    gfx.rect(main.x - reach, main.y - 0.9 * K, 2 * reach, 0.6 * K, '#ffffff', {
      radius: 0.3 * K,
      alpha: 0.5,
    });
  }
  gfx.circle(main.x, main.y, 1.1 * K, '#94a3b8', { stroke: { width: 0.4 * K, color: '#e2e8f0' } });

  const tail = onChopper(TAIL_HUB.x, TAIL_HUB.y);
  gfx.ring(tail.x, tail.y, TAIL_REACH * K, 0.35 * K, '#e2e8f0', { alpha: 0.28, blend: 'add' });
  for (const turn of [0, Math.PI / 2]) {
    const a = t * TAIL_SPIN + turn;
    const dx = TAIL_REACH * Math.cos(a);
    const dy = TAIL_REACH * Math.sin(a);
    const from = onChopper(TAIL_HUB.x - dx, TAIL_HUB.y - dy);
    const to = onChopper(TAIL_HUB.x + dx, TAIL_HUB.y + dy);
    gfx.line(from.x, from.y, to.x, to.y, 0.8 * K, BLADE);
  }
  gfx.circle(tail.x, tail.y, 0.9 * K, '#E6E6E6');
}
