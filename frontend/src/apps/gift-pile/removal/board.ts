// The contract between the pile and the removers: what a removal may ask of the pile
// (`Board`), and what the pile asks of a remover (`Remover`, `Removal`). The pile knows
// removers only through these; each remover decides for itself how it moves, what it looks
// like and how it carries icons off.

/** The canvas, in world pixels. */
export interface World {
  width: number;
  height: number;
}

/** A point in world pixels. */
export interface Point {
  x: number;
  y: number;
}

/**
 * What a removal may ask of the pile while it runs, for the icons set aside for it. They are
 * numbered `0` to `icons.length - 1`, roughly highest first. Each stays in the pile until
 * the removal takes it; one it takes is its own to draw until it drops it back or is over.
 * The pile keeps the books: when the removal is over, every icon it hasn't dropped is
 * destroyed, taken or not.
 */
export interface Board {
  readonly world: World;
  /** An icon's drawn radius, in world pixels. */
  readonly iconRadius: number;
  /** Where each icon was when it was set aside. */
  readonly icons: readonly Point[];
  /** How many of them to drop back: the ones over the number asked for. */
  readonly dropCount: number;
  /** Where icon `i` is now, in the pile or held; null once it is dropped or gone. */
  where(i: number): Point | null;
  /**
   * Take icon `i` out of the pile, so whatever rested on it falls. Returns where it was, or
   * null if it was taken already (or is dropped or gone).
   */
  take(i: number): Point | null;
  /** Let icon `i` go at (x, y), taking it first if need be: it falls back onto the pile. */
  drop(i: number, x: number, y: number): void;
  /** Icon `i` is gone for good, now rather than when the removal is over. */
  destroy(i: number): void;
  /** Draw an icon at (x, y), `scale` times its size. */
  stamp(x: number, y: number, scale?: number): void;
}

/**
 * One way of carrying icons off. The director deals one for each removal and has it `begin`
 * on a `Board`; it picks its own colours and the like with `rng`. To add one, give it its own
 * folder under `removal/` and list it in `removers.ts`.
 */
export interface Remover {
  /** A short name, for tests and debugging. */
  readonly name: string;
  /** Load its images, once, when the page opens; it may run without them until then. */
  load?(): Promise<void>;
  /**
   * Where across the canvas, as a fraction of its width, the icons it takes should be a
   * clump of the pile; roughly the top of the pile, all across, unless it says.
   */
  aim?(rng: () => number): number | undefined;
  /** Start carrying off the board's icons at wall time `now`. */
  begin(board: Board, now: number, rng: () => number): Removal;
}

/** One removal under way, drawn over the pile each frame until it is over. */
export interface Removal {
  /** Nothing of it is left to see. */
  isOver(now: number): boolean;
  /** Draw it as of wall time `now`, using the board to take icons and drop some back. */
  draw(ctx: CanvasRenderingContext2D, now: number): void;
}

/** One of `items`, picked with `rng` (random numbers in [0, 1)). */
export function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}
