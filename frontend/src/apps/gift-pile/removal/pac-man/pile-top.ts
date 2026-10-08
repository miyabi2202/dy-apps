import type { Point } from '../board';

/** The pile's top is sampled this often across, in world pixels, and smoothed over this many samples either side. */
const SAMPLE = 8;
const SMOOTH = 3;

/**
 * The rows Pac-Man runs along: row 0 follows the top of the pile, by the icons' middles, and
 * each row below it is `rowStep` lower. The top is the highest of the icons near each point
 * across, carried across gaps and smoothed so he doesn't jolt.
 */
export class PileTop {
  private readonly top: Float32Array;

  constructor(
    icons: readonly Point[],
    width: number,
    /** How near an icon has to be to a point across to count for its height. */
    reach: number,
    private readonly rowStep: number,
  ) {
    const n = Math.ceil(width / SAMPLE) + 1;
    const raw = new Float32Array(n).fill(NaN);
    for (const { x, y } of icons) {
      const from = Math.max(0, Math.floor((x - reach) / SAMPLE));
      const to = Math.min(n - 1, Math.ceil((x + reach) / SAMPLE));
      for (let k = from; k <= to; k++) raw[k] = Number.isNaN(raw[k]!) ? y : Math.min(raw[k]!, y);
    }
    // Where there are none, keep to the height of the last that has some, or else the next.
    let last = NaN;
    for (let k = 0; k < n; k++) {
      if (Number.isNaN(raw[k]!)) raw[k] = last;
      else last = raw[k]!;
    }
    let next = icons[0]?.y ?? 0;
    for (let k = n - 1; k >= 0; k--) {
      if (Number.isNaN(raw[k]!)) raw[k] = next;
      else next = raw[k]!;
    }
    this.top = raw.map((_, k) => {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, k - SMOOTH); j <= Math.min(n - 1, k + SMOOTH); j++) {
        s += raw[j]!;
        c++;
      }
      return s / c;
    });
  }

  /** The height of row `row` at x. */
  rowAt(x: number, row: number): number {
    const { top } = this;
    const k = Math.min(top.length - 1, Math.max(0, x / SAMPLE));
    const k0 = Math.floor(k);
    const k1 = Math.min(top.length - 1, k0 + 1);
    return top[k0]! + (top[k1]! - top[k0]!) * (k - k0) + row * this.rowStep;
  }
}
