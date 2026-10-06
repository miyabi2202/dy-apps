// What the page and the physics worker say to each other.

export type ToWorker =
  | { type: 'add'; count: number }
  | { type: 'clear' }
  /** A new world of this size, in pixels; the pile is emptied with it. */
  | { type: 'resize'; width: number; height: number };

/** One physics tick's worth of change, after one or more steps. */
export interface Frame {
  /** Simulation time at the end of the tick, in ms. */
  time: number;
  /** The world's size, in pixels. */
  width: number;
  height: number;
  /** Icons in the world so far, moving or at rest. */
  total: number;
  /** Asked for but not yet released. */
  queued: number;
  /** Goes up on every clear, so a renderer knows to start its pile over. */
  generation: number;
  /** The moving icons: their indices, and x, y pairs in pixels. */
  movingIds: Int32Array;
  movingXy: Float32Array;
  /** Icons that came to rest during the tick, the same way. */
  settledIds: Int32Array;
  settledXy: Float32Array;
}

export type FromWorker =
  { type: 'ready' } | { type: 'frame'; frame: Frame } | { type: 'error'; message: string };
