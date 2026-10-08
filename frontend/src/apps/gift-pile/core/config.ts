/** Tuning for the pile. Lengths are CSS pixels, times seconds, unless a name says otherwise. */
export interface PileSettings {
  /**
   * The play area: between the walls and above the floor. The canvas is this plus the
   * `margin` buffer on the left, right and bottom (see `canvasSize`).
   */
  world: { width: number; height: number };
  /** Icons are drawn 2 × this across (24×24). */
  radius: number;
  /** Icons collide as circles of this radius, smaller than drawn, so they visibly overlap in the pile. */
  collisionRadius: number;
  /** How close to an icon's centre a press has to be to pick it up; bigger than drawn, for easy grabbing. */
  grabRadius: number;
  /** The buffer between the canvas edge and the walls and floor, so icons at the edge can still be reached. */
  margin: number;
  /** The most icons the pile holds in total. */
  maxItems: number;
  /**
   * The share of the canvas's height kept clear above the pile, for the removals to work in:
   * once the pile grows into it, the view moves up with it (the bottom of the pile goes out
   * of sight) and new icons drop in from just above the view.
   */
  headroom: number;
  gravity: number;
  /**
   * Icons released per second while some are queued. The top edge only lets so many through:
   * about `width / (2 × collisionRadius)` side by side, each needing that much fall before
   * the next, so this stays well under `columns × spawnSpeed / (2 × collisionRadius)`. A
   * denser stream also lands as a heavy dynamic mass that presses icons into each other.
   */
  spawnPerSecond: number;
  /** New icons start already falling this fast, so a stream clears the way for the next. */
  spawnSpeed: number;
  /** Surface friction between icons, and with the floor and walls; what lets a heap form. */
  friction: number;
  /**
   * Pixels per metre handed to the physics engine. Its tolerances and its speed cap are in
   * metres, so an icon's collision circle is made about half a metre across: pixels straight
   * in made every fall crawl.
   */
  pxPerMetre: number;
  /**
   * Stiffness of contacts, in Hz. The engine's default of 30 lets a fast, heavy stream sink
   * icons into each other by most of a radius; at 120 they stay within a pixel. Soft contacts
   * only calm down when `contactHz <= solverSubsteps × stepHz / 4`; above that a deep moving
   * mass jitters for good.
   */
  contactHz: number;
  /**
   * Solver substeps per physics step. Rapier's default of 4 gives 240 Hz, which can't settle
   * 120 Hz contacts: after a bulk removal a 9,000-icon column took 67 s to come to rest. At 8
   * (480 Hz) it takes 7 s, resting icons overlap by half a pixel, and a step costs the same.
   */
  solverSubsteps: number;
  /** Physics steps per second. */
  stepHz: number;
  /**
   * An icon slower than `speed` for `steps` steps, touching something that can hold it,
   * comes to rest, unless something presses it more than `overlap` into a neighbour; then it
   * waits for the engine to push it clear, up to `maxSteps` steps.
   */
  settle: { speed: number; steps: number; overlap: number; maxSteps: number };
  /**
   * Released this many steps ago or more, a moving icon counts as part of the heap rather
   * than the falling stream, so new icons are released above it. A heavy stream makes the
   * heap top rise too fast for anything in it to count as slow.
   */
  heapAge: number;
}

export const PILE: PileSettings = {
  world: { width: 400, height: 700 },
  radius: 12,
  collisionRadius: 6,
  grabRadius: 12,
  margin: 8,
  maxItems: 100_000,
  headroom: 1 / 3,
  gravity: 2400,
  spawnPerSecond: 600,
  spawnSpeed: 600,
  friction: 0.6,
  pxPerMetre: 16,
  contactHz: 120,
  solverSubsteps: 8,
  stepHz: 60,
  settle: { speed: 30, steps: 6, overlap: 1, maxSteps: 120 },
  heapAge: 20,
};

/** The canvas for a play area of `world`: the margin added on the left, right and bottom. */
export function canvasSize(
  world: { width: number; height: number },
  margin = PILE.margin,
): { width: number; height: number } {
  return { width: world.width + 2 * margin, height: world.height + margin };
}
