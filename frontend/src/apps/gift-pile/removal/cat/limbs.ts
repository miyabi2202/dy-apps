import type { Color, Gfx, Point } from '../board';

// How the cat's legs move and bend, and how a tapering limb is drawn: the geometry its body
// (`body.ts`) is built from. Points are in the cat's own frame (facing right, y down) unless
// they say they are in the world.

const TAU = Math.PI * 2;

/** Where a foot is in its step: how far forward of where it stands, how high it is lifted, and how far through its swing (0 planted, 1 at the top of its swing). */
export interface Step {
  dx: number;
  up: number;
  swing: number;
}

/**
 * Where a foot is at phase `p` of its stride (in turns): planted for the first half, sliding
 * back from `reach` ahead of its rest to `reach` behind it as the body goes over it, then lifted
 * up to `height` and swung forward again.
 */
export function stepAt(p: number, reach: number, height: number): Step {
  const u = p - Math.floor(p);
  if (u < 0.5) return { dx: reach * (1 - 4 * u), up: 0, swing: 0 };
  const s = (u - 0.5) * 2;
  const swing = Math.sin(Math.PI * s);
  return { dx: reach * (-1 + 2 * (s * s * (3 - 2 * s))), up: swing * height, swing };
}

/** How high a pair of shoulders or hips rides at phase `p` of the stride of the leg under it: up (negative) over a planted foot, twice a stride. */
export function bobAt(p: number, amount: number): number {
  return -amount * Math.cos(2 * TAU * (p - 0.25));
}

/**
 * The joint between two bones of `l1` and `l2` that reach from `a` to `b`: bent out to the
 * left of the way from `a` to `b` as seen on screen if `bend` is 1 (behind a leg pointing
 * down, for a cat facing right: its elbow), to the right if -1 (in front: its knee). Straight,
 * along the way to `b`, if `b` is out of reach.
 */
export function joint(a: Point, b: Point, l1: number, l2: number, bend: 1 | -1): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.max(1e-3, Math.hypot(dx, dy));
  const ux = dx / d;
  const uy = dy / d;
  const reach = Math.min(d, l1 + l2 - 1e-3);
  const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along)) * bend;
  return { x: a.x + ux * along - uy * out, y: a.y + uy * along + ux * out };
}

/** `b`, or the point on the way to it that is `most` from `a` if it is further. */
export function within(a: Point, b: Point, most: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= most) return b;
  return { x: a.x + (dx / d) * most, y: a.y + (dy / d) * most };
}

/** `v` turned `angle` radians clockwise on screen. */
export function turn(v: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** The point a share `u` of the way from `a` to `b`. */
export function lerp(a: Point, b: Point, u: number): Point {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/**
 * A limb through world `points`, `widths[k]` thick at point `k` and tapering between them,
 * each joint rounded: a disc at every point and a quad joining each to the next.
 */
export function taper(
  gfx: Gfx,
  points: readonly Point[],
  widths: readonly number[],
  color: Color,
): void {
  for (let k = 0; k < points.length; k++) {
    const p = points[k]!;
    gfx.circle(p.x, p.y, widths[k]! / 2, color);
    if (k === 0) continue;
    const q = points[k - 1]!;
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) continue;
    const nx = -dy / d;
    const ny = dx / d;
    const r0 = widths[k - 1]! / 2;
    const r1 = widths[k]! / 2;
    gfx.polygon(
      [
        q.x + nx * r0,
        q.y + ny * r0,
        p.x + nx * r1,
        p.y + ny * r1,
        p.x - nx * r1,
        p.y - ny * r1,
        q.x - nx * r0,
        q.y - ny * r0,
      ],
      color,
    );
  }
}

/** A short stripe across a limb a share `u` of the way from world `a` to `b`, `width` across. */
export function band(
  gfx: Gfx,
  a: Point,
  b: Point,
  u: number,
  width: number,
  color: Color,
  alpha = 1,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * width * 0.5;
  const ny = (dx / d) * width * 0.5;
  const cx = a.x + dx * u;
  const cy = a.y + dy * u;
  gfx.line(cx - nx, cy - ny, cx + nx, cy + ny, 1.4, color, { cap: 'butt', alpha });
}

/**
 * A fine line down one side of a limb through world `points` (`widths` thick at each), from
 * `from` of the way along its first bone to the end of its second: `side` 1 for the left of the
 * way down it as seen on screen, -1 for the right. It picks the limb out where it lies over its
 * own body, without a seam where it grows out of it.
 */
export function crease(
  gfx: Gfx,
  points: readonly Point[],
  widths: readonly number[],
  from: number,
  side: number,
  color: Color,
  alpha: number,
): void {
  const edge = (a: Point, b: Point, u: number, w: number) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return [a.x + dx * u - (dy / d) * w * side, a.y + dy * u + (dx / d) * w * side];
  };
  const p0 = points[0]!;
  const p1 = points[1]!;
  const p2 = points[2]!;
  const w0 = widths[0]! + (widths[1]! - widths[0]!) * from;
  gfx.polyline(
    [
      ...edge(p0, p1, from, w0 / 2 - 0.4),
      ...edge(p0, p1, 1, widths[1]! / 2 - 0.4),
      ...edge(p1, p2, 1, widths[2]! / 2 - 0.4),
    ],
    1,
    color,
    { alpha },
  );
}
