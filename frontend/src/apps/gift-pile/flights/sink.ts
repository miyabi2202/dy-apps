/** What the flights ask of the engine, through the worker; `PileClient` is one. */
export interface FlightSink {
  /** Icons in the pile right now, moving, resting or held. */
  alive(): number;
  /** Drop `count` more icons in. */
  add(count: number): void;
  /** Set `count` icons aside for a flight, `drop` of them to be dropped back. */
  scoop(count: number, drop: number): void;
  /** Destroy `count` icons at once. */
  remove(count: number): void;
  /** Take icon `id` out of the pile; it is held from then on. */
  grab(id: number): void;
  /** Let held icon `id` go at (x, y): it falls from there. */
  release(id: number, x: number, y: number): void;
  /** Held icon `id` is gone for good. */
  destroy(id: number): void;
}
