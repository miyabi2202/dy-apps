/** How far outside the canvas a craft starts and finishes, in world pixels. */
export const OVERSHOOT = 70;

/** The canvas, in world pixels. */
export interface World {
  width: number;
  height: number;
}

/** A flight's course across the canvas, for a craft to follow. */
export interface Course extends World {
  /** The craft's centre's height while crossing (for the car: at the top of a ramp). */
  altitude: number;
  /** How long the crossing takes, in ms. */
  crossMs: number;
}

/** The craft's centre and heading: `tilt` is the angle to turn it by, negative being nose up. */
export interface Pose {
  py: number;
  tilt: number;
}

/**
 * Something that tows the vacuum across the canvas, left to right. A flight picks one at
 * random, works out its course from `crossMs`, `tie`, `minY` and `sag`, then asks it each
 * frame where it is (`pathAt`) and to draw itself (`draw`) and any scenery (`drawScene`).
 * To add a craft, implement this and list it where the flights are made.
 */
export interface Craft {
  /** A short name, for tests and debugging. */
  readonly name: string;
  /** How long it takes to cross the canvas, in ms: slow enough to be seen. */
  readonly crossMs: number;
  /** From the craft's centre to where the vacuum's rope ties on. */
  readonly tie: { dx: number; dy: number };
  /** The least the centre's height can be on this canvas, so the craft still shows. */
  minY(world: World): number;
  /** How far below the course's `altitude` the craft dips while over the pile. */
  sag(world: World): number;
  /** Where the craft is at `px`, `t` ms into the flight. */
  pathAt(course: Course, px: number, t: number): Pose;
  /**
   * Anything behind the craft and the vacuum, like the car's bridge, drawn before them;
   * `remainingMs` is how long the flight has left, for fading out.
   */
  drawScene?(ctx: CanvasRenderingContext2D, course: Course, t: number, remainingMs: number): void;
  /** The craft itself, centred at (x, y) and turned by `tilt`. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number): void;
}
