// Points along curves, for drawing path art with `Gfx.polyline` and `Gfx.polygon`. A
// path is a flat list of x, y pairs.

/** `segments` + 1 points along the quadratic curve from (x0, y0) to (x1, y1) pulled towards (cx, cy). */
export function bezierPoints(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  segments: number,
): number[] {
  const points: number[] = [];
  for (let k = 0; k <= segments; k++) {
    const u = k / segments;
    const v = 1 - u;
    points.push(v * v * x0 + 2 * v * u * cx + u * u * x1, v * v * y0 + 2 * v * u * cy + u * u * y1);
  }
  return points;
}

/** `segments` + 1 points along the circle of radius `r` about (cx, cy), from angle `from` to `to`. */
export function arcPoints(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  segments: number,
): number[] {
  const points: number[] = [];
  for (let k = 0; k <= segments; k++) {
    const a = from + ((to - from) * k) / segments;
    points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return points;
}
