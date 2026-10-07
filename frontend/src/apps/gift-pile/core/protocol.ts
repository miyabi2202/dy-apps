// What the page and the physics worker say to each other.

export type ToWorker =
  | { type: 'add'; count: number }
  /** Destroy this many icons, roughly from the top of the pile down. */
  | { type: 'remove'; count: number }
  /**
   * Set this many icons aside, roughly from the top of the pile down, for the page to carry
   * away: each stays in the pile until the page grabs it, and is then held until released
   * or destroyed. `extra` of them are over the number the user asked to remove, to be
   * dropped back; it is echoed in the `Scoop`. With `near`, a fraction of the canvas's
   * width, they are a clump of the pile around there instead.
   */
  | { type: 'scoop'; count: number; extra: number; near?: number }
  | { type: 'clear' }
  /** A new world with a play area of this size, in pixels; the pile is emptied with it. */
  | { type: 'resize'; width: number; height: number }
  /** The user picked up this icon: out of the pile and out of the engine until let go. */
  | { type: 'grab'; id: number }
  /** The user let go of a held icon here (in pixels): it falls from there. */
  | { type: 'release'; id: number; x: number; y: number }
  /** The user dropped a held icon in the bin: gone for good. */
  | { type: 'destroy'; id: number };

/** The icons one `scoop` set aside: their indices and x, y pairs in pixels, roughly highest first. */
export interface Scoop {
  ids: Int32Array;
  xy: Float32Array;
  /** How many of them are over the number asked for, and are to be dropped back. */
  drop: number;
}

/** One physics tick's worth of change, after one or more steps. */
export interface Frame {
  /** Simulation time at the end of the tick, in ms. */
  time: number;
  /** The canvas's size, in pixels: the play area plus its margin. */
  width: number;
  height: number;
  /** Icons in the world, moving, at rest or held; destroyed ones no longer count. */
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
  /** Icons that left the resting pile during the tick: picked up, or woken by a gap under them. */
  wokenIds: Int32Array;
  /** What each `scoop` since the last frame set aside, in order. */
  scooped: Scoop[];
}

export type FromWorker =
  { type: 'ready' } | { type: 'frame'; frame: Frame } | { type: 'error'; message: string };
