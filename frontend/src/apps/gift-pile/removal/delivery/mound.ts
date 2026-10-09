// The little mound of icons heaped in the top of the delivery box: where each slot in it is, and
// how the lid squashes it. However many icons a removal carries, the mound keeps to two rows,
// small icons sunk into the rim with a few heaped over them, so it never stands more than about
// half the box's height over the rim; the rest go into the box. It is laid out from the middle of
// the rim, in the scooter's frame: x forward, y down, in world pixels.

/** How big the mound's icons are drawn: their radius, in world pixels. */
export const MOUND_ICON_R = 5.4;
/** The slots in the bottom row, sunk into the rim, which he keeps; and all the slots. */
export const MOUND_KEEP = 4;
export const MOUND_SLOTS = 7;
/** How far apart its icons are across, at the box's own width. */
const STEP = 10.2;
/** The slots in the order they are filled: the bottom row middle out, then the row over it. */
const SLOTS: readonly { col: number; row: number; turn: number }[] = [
  { row: 0, col: 1, turn: 0.25 },
  { row: 0, col: 2, turn: -0.3 },
  { row: 0, col: 0, turn: 0.4 },
  { row: 0, col: 3, turn: -0.2 },
  { row: 1, col: 1, turn: 0.15 },
  { row: 1, col: 0, turn: -0.35 },
  { row: 1, col: 2, turn: 0.3 },
];

/** Where an icon of the mound is drawn, from the rim's middle, and how it is turned and squashed. */
export interface Heaped {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Where slot `k` is, with the box `sx` times its width, `rise` px below it (popping up into it),
 * and squashed under the lid: `lift` says how high the lid's underside is at a point across.
 */
export function heap(k: number, sx: number, rise: number, lift: (dx: number) => number): Heaped {
  const { row, col, turn } = SLOTS[k]!;
  const x = row === 0 ? (col - 1.5) * STEP * sx : (col - 1) * STEP * sx;
  // The bottom row is domed, its middle a little higher; the top row sits in its dips.
  let y = (row === 0 ? (col === 1 || col === 2 ? -1.6 : 0.6) : -10.2) + rise;
  const r = MOUND_ICON_R;
  // Where it pokes up into the lid, the lid squashes it flat, then pushes it down into the box.
  const over = r - y - lift(x);
  let scaleY = 1;
  if (over > 0) {
    scaleY = Math.max(0.72, 1 - over / (2 * r));
    const squashed = 2 * r * (1 - scaleY);
    y += r * (1 - scaleY) + Math.max(0, over - squashed);
  }
  return { x, y, rotation: turn, scaleX: 1 + 0.6 * (1 - scaleY), scaleY };
}
