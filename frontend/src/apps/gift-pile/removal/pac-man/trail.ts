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
