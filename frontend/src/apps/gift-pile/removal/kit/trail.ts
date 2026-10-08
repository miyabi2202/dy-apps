import type { Point } from '../board';

/** How many points it keeps, and how many it lets go of at a time once it has that many. */
const KEEP = 400;
const SHED = 100;

/** Where something has been, latest last, so another can follow the same way behind it. */
export class Trail {
  private points: Point[];

  constructor(start: Point) {
    this.points = [start];
  }

  add(at: Point): void {
    this.points.push(at);
    if (this.points.length > KEEP) this.points.splice(0, SHED);
  }

  /** The point `gap` back along the trail from the latest, or straight back to the left past its start. */
  behind(gap: number): Point {
    const { points } = this;
    let left = gap;
    for (let k = points.length - 1; k > 0; k--) {
      const a = points[k]!;
      const b = points[k - 1]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= left) {
        const f = left / d;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
      left -= d;
    }
    const first = points[0]!;
    return { x: first.x - left, y: first.y };
  }
}

/**
 * Where something has been in the last `span` ms, to draw as a ribbon behind it: points are
 * added as it moves, and the ones that are too old let go.
 */
export class Wake {
  private readonly xy: number[] = [];
  private readonly times: number[] = [];
  private readonly out: number[] = [];

  constructor(private readonly span: number) {}

  /** It is at (x, y) at time `now` (ms). */
  add(x: number, y: number, now: number): void {
    this.xy.push(x, y);
    this.times.push(now);
    let old = 0;
    while (old < this.times.length && now - this.times[old]! > this.span) old++;
    if (old > 0) {
      this.xy.splice(0, 2 * old);
      this.times.splice(0, old);
    }
  }

  /** The points to draw `gfx.ribbon` through: x, y pairs, latest first, so the ribbon fades to its tail. */
  points(): readonly number[] {
    const { xy, out } = this;
    out.length = 0;
    for (let k = xy.length - 2; k >= 0; k -= 2) out.push(xy[k]!, xy[k + 1]!);
    return out;
  }

  clear(): void {
    this.xy.length = 0;
    this.times.length = 0;
  }
}
