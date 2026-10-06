/** Tuning for the pile. Lengths are CSS pixels, times seconds, unless a name says otherwise. */
export interface PileSettings {
  /** The world's size; the canvas shows exactly this, scaled down with the page. */
  world: { width: number; height: number };
  /** Icons are 16×16, so each one collides as a circle of this radius. */
  radius: number;
  /** The most icons the pile holds in total. */
  maxItems: number;
  gravity: number;
  /**
   * Icons released per second while some are queued. The top edge only lets so many through:
   * about `width / (2 × radius)` side by side, each needing `2 × radius` of fall before the
   * next, so this stays under `columns × spawnSpeed / (2 × radius)` with room to spare.
   */
  spawnPerSecond: number;
  /** New icons start already falling this fast, so a stream clears the way for the next. */
  spawnSpeed: number;
  /** Fastest an icon moves, falling or sliding. */
  maxSpeed: number;
  /** How an icon balanced on the very top of another starts to slide off, in px/s. */
  nudge: number;
}

export const PILE: PileSettings = {
  world: { width: 1200, height: 700 },
  radius: 8,
  maxItems: 100_000,
  gravity: 2400,
  spawnPerSecond: 1200,
  spawnSpeed: 600,
  maxSpeed: 3000,
  nudge: 30,
};

/** The frame loop: a fixed simulation step, several per frame, and a cap so a stalled tab never catches up. */
export const FRAME = {
  stepMs: 1000 / 120,
  maxStepsPerFrame: 4,
} as const;
