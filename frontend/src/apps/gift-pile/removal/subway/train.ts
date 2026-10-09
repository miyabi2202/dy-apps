import type { Gfx } from '../board';
import { drawCar } from './shader';

// The subway car, seen from the side and facing right, and the track it runs on. Everything here
// is in the car's own units: a car 320 long, its origin in the middle of its side, y down. The
// floor (and the platform) is at `FLOOR`, the rail at `RAIL`; the caller scales the car to the
// canvas. The body is GLSL (`shader.ts`); the underframe, bogies and track are plain `Gfx` calls.

/** Half the car's length, and where its roof, its floor and the bottom of its skirt are. */
export const CAR_HALF = 160;
export const ROOF = -52;
export const FLOOR = 22;
export const SKIRT = 40;
/** The body bulges about this height, so roof and skirt both bow out as it fills. */
export const BULGE_MID = -6;
/** The doorway in the middle of the side: half its width, and its top (its bottom is the floor). */
export const DOOR_HALF = 19;
export const DOOR_TOP = -40;
/** The windows: each one's middle across and half its width; all run from `WINDOW_TOP` to `WINDOW_BOTTOM`. */
export const WINDOWS: readonly (readonly [x: number, half: number])[] = [
  [-145, 10],
  [-108, 20],
  [-56, 20],
  [56, 20],
  [108, 20],
  [145, 10],
];
export const WINDOW_TOP = -34;
export const WINDOW_BOTTOM = -6;
/** The rail's top, the wheels' radius, and where the bogies' middles and their wheels are. */
export const RAIL = 59;
const WHEEL = 7;
const BOGIES = [-108, 108];
const AXLE = 14;

/** What a car is painted in: its line's colour on the band, and the darker accent under it. */
export interface Livery {
  line: string;
  accent: string;
}

/** The liveries to pick from: green, the first, then red, blue, orange and violet. */
export const LIVERIES: readonly Livery[] = [
  { line: '#2fae4f', accent: '#17652c' },
  { line: '#d7262e', accent: '#7f1016' },
  { line: '#1f6fd1', accent: '#0d3a7a' },
  { line: '#f08a1c', accent: '#9b4c07' },
  { line: '#8e44c9', accent: '#51207a' },
];

/** How far across the body bows out at `x`, for a car bulging by `bulge`: most in the middle, none past its ends. */
function bow(x: number): number {
  const u = x / (CAR_HALF + 10);
  return Math.max(0, 1 - u * u);
}

/** Where the point (x, y) of a car at rest is on the car bulging by `bulge`. */
export function bulged(x: number, y: number, bulge: number): number {
  return (y - BULGE_MID) * (1 + bulge * bow(x)) + BULGE_MID;
}

/** How the car is to be drawn this frame. */
export interface CarLook {
  /** Where its origin is in the world, and how many world px a unit of it is. */
  x: number;
  y: number;
  scale: number;
  /** How far it has sunk on its springs under the load, in its units: the wheels stay on the rail. */
  sag: number;
  /** How far open the doors are, 0 to 1. */
  open: number;
  /** How far the body bows out, 0 at rest. */
  bulge: number;
  /** The red lamp over the door, 0 to 1, for doors about to close. */
  lamp: number;
  /** How far it has run, in world px, for the wheels' turning. */
  run: number;
  livery: Livery;
}

/** The far side of the car, seen through its windows and open door: lit walls, straps and the windows across. */
export function drawCarInterior(gfx: Gfx, car: CarLook): void {
  gfx.push(car.x, car.y + car.sag * car.scale, 0, car.scale);
  drawCar(gfx, car, 0);
  gfx.pop();
}

/** The underframe and bogies, which stay on the rail as the body sinks. */
export function drawCarUnder(gfx: Gfx, car: CarLook): void {
  gfx.push(car.x, car.y, 0, car.scale);
  // The underframe, hung from the body, and its boxes of gear.
  const sag = car.sag;
  gfx.rect(-CAR_HALF + 14, SKIRT - 2 + sag, 2 * CAR_HALF - 28, 8, '#2b2f36');
  for (const [x, w] of [
    [-70, 34],
    [-22, 20],
    [26, 40],
  ] as const) {
    gfx.rect(x, SKIRT + 4 + sag, w, 6, '#3b4049', { radius: 1.5 });
  }
  // Each bogie: a frame over two wheels whose spokes turn with the run.
  const turn = car.run / car.scale / WHEEL;
  for (const bx of BOGIES) {
    gfx.rect(bx - AXLE - 9, RAIL - WHEEL - 5, 2 * AXLE + 18, 6, '#1f2329', { radius: 2 });
    for (const ax of [bx - AXLE, bx + AXLE]) {
      const cy = RAIL - WHEEL;
      gfx.circle(ax, cy, WHEEL, '#16191d');
      gfx.ring(ax, cy, WHEEL - 1.6, 1.2, '#59606b');
      for (let k = 0; k < 3; k++) {
        const a = turn + (k * Math.PI) / 3;
        const dx = Math.cos(a) * (WHEEL - 2);
        const dy = Math.sin(a) * (WHEEL - 2);
        gfx.line(ax - dx, cy - dy, ax + dx, cy + dy, 0.9, '#59606b');
      }
      gfx.circle(ax, cy, 1.8, '#9aa2ad');
    }
    // The spring over the bogie, squashed by the load.
    gfx.line(bx, RAIL - WHEEL - 5, bx, SKIRT + 6 + sag, 3, '#4a505a');
  }
  gfx.pop();
}

/** The body: steel, its line's band, the windows' glass, the door leaves and lamps. */
export function drawCarBody(gfx: Gfx, car: CarLook): void {
  gfx.push(car.x, car.y + car.sag * car.scale, 0, car.scale);
  drawCar(gfx, car, 1);
  gfx.pop();
}

/** The track across the canvas at world height `railY` (the top of the rail), `alpha` faded in or out. */
export function drawTrack(
  gfx: Gfx,
  width: number,
  railY: number,
  scale: number,
  alpha: number,
): void {
  if (alpha <= 0) return;
  // The girder the track is laid on, then the sleepers, then the rail with a shine along its top.
  const girder = 7 * scale;
  gfx.rect(-10, railY + 4 * scale, width + 20, girder, '#3a3f47', { alpha });
  gfx.rect(-10, railY + 4 * scale + girder - 1.5, width + 20, 1.5, '#23272d', { alpha });
  const step = 13 * scale;
  for (let x = -step; x < width + step; x += step) {
    gfx.rect(x, railY + 1.5 * scale, 7 * scale, 3 * scale, '#5b4636', { alpha });
  }
  gfx.rect(-10, railY - 0.5 * scale, width + 20, 2.6 * scale, '#7d8590', { alpha });
  gfx.rect(-10, railY - 0.5 * scale, width + 20, 0.9 * scale, '#e3e8ee', { alpha });
}

/** Where to see the car's interior from: a slot in a window or the doorway, in its units, for a squashed passenger. */
export interface Slot {
  x: number;
  y: number;
  /** In the doorway, so seen only while it is open. */
  door: boolean;
  /** A seed for its jiggle and squash. */
  seed: number;
}

/**
 * Places for passengers to be seen pressed against the glass: a grid over each window and the
 * doorway, `spacing` units apart and a little jumbled, in a random order, so that filling the
 * first few spreads them through the car.
 */
export function carSlots(spacing: number, rng: () => number): Slot[] {
  const slots: Slot[] = [];
  const grid = (x0: number, x1: number, y0: number, y1: number, door: boolean) => {
    const cols = Math.max(1, Math.round((x1 - x0) / spacing));
    const rows = Math.max(1, Math.round((y1 - y0) / spacing));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        slots.push({
          x: x0 + ((c + 0.5) * (x1 - x0)) / cols + (rng() - 0.5) * spacing * 0.3,
          y: y0 + ((r + 0.5) * (y1 - y0)) / rows + (rng() - 0.5) * spacing * 0.3,
          door,
          seed: rng() * 40,
        });
      }
    }
  };
  for (const [x, half] of WINDOWS) grid(x - half, x + half, WINDOW_TOP, WINDOW_BOTTOM, false);
  grid(-DOOR_HALF, DOOR_HALF, DOOR_TOP + 2, FLOOR - 2, true);
  // Shuffled, so the first to fill are all over the car.
  for (let k = slots.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [slots[k], slots[j]] = [slots[j]!, slots[k]!];
  }
  return slots;
}
