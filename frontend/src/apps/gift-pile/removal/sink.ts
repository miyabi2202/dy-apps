/** What the removals ask of the engine, through the worker; `PileClient` is one. */
export interface RemovalSink {
  /** Icons in the pile right now, moving, resting or held. */
  alive(): number;
  /** Drop `count` more icons in. */
  add(count: number): void;
  /**
   * Set `count` icons aside for a removal, `drop` of them to be dropped back: roughly the top
   * of the pile, or a clump `near` a fraction of the canvas's width.
   */
  scoop(count: number, drop: number, near?: number): void;
  /** Destroy `count` icons at once. */
  remove(count: number): void;
  /** Take icon `id` out of the pile; it is held from then on. */
  grab(id: number): void;
  /** Let held icon `id` go at (x, y): it falls from there. */
  release(id: number, x: number, y: number): void;
  /** Held icon `id` is gone for good. */
  destroy(id: number): void;
}
