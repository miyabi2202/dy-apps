import type { Scoop } from '../core/protocol';

/** Stamps the icon sprite centred at (x, y), in world pixels, at `scale` times its size. */
export type Stamp = (x: number, y: number, scale?: number) => void;

/**
 * Where icon `id` is now, in world pixels, or null if the renderer doesn't have it; the
 * renderer stops drawing it from here on, as the overlay takes over.
 */
export type Take = (id: number) => { x: number; y: number } | null;

/** Where icon `id` is now and whether it is at rest, or null if the renderer doesn't have it. */
export type Peek = (id: number) => { x: number; y: number; resting: boolean } | null;

/** What an overlay may ask of the renderer while drawing. */
export interface Hooks {
  stamp: Stamp;
  take: Take;
  peek: Peek;
}

/**
 * Something drawn over the pile each frame that can take icons out of the renderer's hands:
 * the removals that carry icons away. The renderer tells it what the worker scooped
 * and when the pile was cleared, asks it which icons it holds (so they can't be grabbed), and
 * has it draw after the moving icons, with hooks into the renderer's own drawing and state.
 */
export interface Overlay {
  /** A frame brought a scoop, at wall time `now`: these icons are the overlay's to take. */
  onScoop(scoop: Scoop, world: { width: number; height: number }, now: number): void;
  /** The engine let everything go (a clear or resize). */
  reset(): void;
  /** Icon `id` is the overlay's, so the user can't pick it up. */
  holds(id: number): boolean;
  /** Draw as of wall time `now`. */
  draw(ctx: CanvasRenderingContext2D, now: number, hooks: Hooks): void;
}
