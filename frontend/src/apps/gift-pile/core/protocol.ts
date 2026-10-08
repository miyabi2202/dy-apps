// What the page and the physics worker say to each other.

/**
 * Which icons a scoop picks: roughly the top of the pile all across (`top`, the default); a
 * rounded clump off the top at a point across it, as a fraction of the canvas's width
 * (`clump`); or the pile's outer layer evenly all across, then the next one down (`layers`).
 */
export type ScoopShape = { kind: 'top' } | { kind: 'clump'; at: number } | { kind: 'layers' };

export type ToWorker =
  | { type: 'add'; count: number }
  /** Destroy this many icons, roughly from the top of the pile down. */
  | { type: 'remove'; count: number }
  /**
   * Set this many icons aside, roughly from the top of the pile down, for the page to carry
   * away: each stays in the pile until the page grabs it, and is then held until released
   * or destroyed. `extra` of them are over the number the user asked to remove, to be
   * dropped back; it is echoed in the `Scoop`. `shape` says which to pick, if not the top.
   */
  | { type: 'scoop'; count: number; extra: number; shape?: ScoopShape }
  | { type: 'clear' }
  /** A new world with a play area of this size, in pixels; the pile is emptied with it. */
  | { type: 'resize'; width: number; height: number }
  /** The user or a removal picked up this icon: out of the pile and the engine until let go. */
  | { type: 'grab'; id: number }
  /**
   * A held icon is let go here (in pixels): it falls from there, moving at `vx`, `vy` (in
   * pixels per second) if given.
   */
  | { type: 'release'; id: number; x: number; y: number; vx?: number; vy?: number }
  /** A held icon is gone for good: dropped in the bin, or carried off. */
  | { type: 'destroy'; id: number }
  /**
   * New icons are released at this y (in pixels, above the canvas's top when the view has
   * moved up with a tall pile); until it is sent, just above the canvas. A clear forgets it.
   */
  | { type: 'setDropLine'; y: number };

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
