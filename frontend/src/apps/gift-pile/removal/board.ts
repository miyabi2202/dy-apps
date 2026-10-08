import type { ScoopShape } from '../core/protocol';

export type { ScoopShape };

// The contract between the pile and the removers: what a removal may ask of the pile
// (`Board`), and what the pile asks of a remover (`Remover`, `Removal`). The pile knows
// removers only through these; each remover decides for itself how it moves, what it looks
// like and how it carries icons off.

/** The canvas, in world pixels. */
export interface World {
  width: number;
  height: number;
}

/**
 * The part of the world on screen: the world y of its top, and its height. The view starts at
 * the canvas's top, and moves up with a pile that has grown into its headroom.
 */
export interface View {
  top: number;
  height: number;
}

/**
 * The view onto the pile while a removal runs. It stays put unless the removal moves it, say
 * to follow something of its own down into the pile; once the removal is over, it follows
 * the pile again. It never goes below the floor.
 */
export interface Camera {
  /** What is on screen now. */
  readonly view: View;
  /** Ease the view so its top is at `top`. */
  moveTo(top: number): void;
  /** Move the view only as far as needed for `y` to be on screen, at least `margin` from its top and bottom. */
  keepInView(y: number, margin: number): void;
}

/** Where the top of `view` has to be for `y` to be on screen at least `margin` from its edges: where it is, if it already is. */
export function topKeeping(view: View, y: number, margin: number): number {
  if (y > view.top + view.height - margin) return y - (view.height - margin);
  if (y < view.top + margin) return y - margin;
  return view.top;
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
  /** The view onto the pile: things should come and go, and hover, within it. */
  readonly camera: Camera;
  /** An icon's drawn radius, in world pixels. */
  readonly iconRadius: number;
  /** Where each icon was when it was set aside. */
  readonly icons: readonly Point[];
  /** How many of them to drop back: the ones over the number asked for. */
  readonly dropCount: number;
  /** The top of the pile at x now, by the middle of the highest icon there, any icon; null if there are none. */
  topAt(x: number): number | null;
  /** Where icon `i` is now, in the pile or held; null once it is dropped or gone. */
  where(i: number): Point | null;
  /**
   * Take icon `i` out of the pile, so whatever rested on it falls. Returns where it was, or
   * null if it was taken already (or is dropped or gone).
   */
  take(i: number): Point | null;
  /**
   * Let icon `i` go at (x, y), taking it first if need be: it falls back onto the pile, from
   * rest or moving at (vx, vy) world pixels per second.
   */
  drop(i: number, x: number, y: number, vx?: number, vy?: number): void;
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
  /** Which icons it should be given (see `ScoopShape`); roughly the top of the pile, all across, unless it says. */
  shape?(rng: () => number): ScoopShape;
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
