export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
}

/** Small, fast, seedable PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Replays `values` in order, cycling when exhausted. For tests. */
export function sequenceRng(values: readonly number[]): Rng {
  if (values.length === 0) throw new Error('sequenceRng needs at least one value');
  let i = 0;
  return {
    next() {
      const v = values[i % values.length]!;
      i += 1;
      return v;
    },
  };
}

export function constantRng(value: number): Rng {
  return { next: () => value };
}

/** Integer in [0, n). Safe even if the source returns exactly 1. */
export function randomInt(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng.next() * n));
}

/** In-place Fisher–Yates shuffle. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** Derive independent child seeds from one seed. */
export function deriveSeed(seed: number, stream: number): number {
  return mulberry32((seed ^ Math.imul(stream + 1, 0x9e3779b1)) >>> 0).next() * 4294967296;
}
