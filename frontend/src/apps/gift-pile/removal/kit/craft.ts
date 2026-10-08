import type { World } from '../board';

/** How far outside the canvas a craft starts and finishes, in world pixels. */
export const OVERSHOOT = 70;

/** A crossing's course across the canvas, for a craft to follow. */
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

/** Where icons go into a craft, and where the ones it drops come out, in world pixels. */
export interface Openings {
  inX: number;
  inY: number;
  outX: number;
  outY: number;
}

/**
 * How a craft takes icons in, from the point (`tie`) where it fits on to the craft: the
 * `Vacuum` it tows.
 */
export interface Intake {
  /** From the tie point down to where icons go in, at rest: the course keeps this clear of the pile. */
  readonly reach: number;
  /** Where icons go in and come out, with the tie at (tieX, tieY), `t` ms into the crossing. */
  openings(tieX: number, tieY: number, t: number): Openings;
  /** Draw it, behind the craft; `fullness` is how much of the load is in, from 0 to 1. */
  draw(
    ctx: CanvasRenderingContext2D,
    tieX: number,
    tieY: number,
    t: number,
    fullness: number,
  ): void;
}

/**
 * Something that crosses the canvas, left to right, taking icons in as it goes (`intake`):
 * a remover that runs a `Crossing` as its removal. The crossing works out its course from
 * `crossMs`, `tie`, `minY` and `sag`, then asks it each frame where it is (`pathAt`) and to
 * draw itself (`draw`) and any scenery (`drawScene`).
 */
export interface Craft {
  /** A short name, for tests and debugging. */
  readonly name: string;
  /** How long it takes to cross the canvas, in ms: slow enough to be seen. */
  readonly crossMs: number;
  /** From the craft's centre to where its intake fits on, like the vacuum's rope. */
  readonly tie: { dx: number; dy: number };
  /** How it takes icons in. */
  readonly intake: Intake;
  /** How far below the view's top the centre must stay, on this canvas, so the craft still shows. */
  minY(world: World): number;
  /** How far below the course's `altitude` the craft dips while over the pile. */
  sag(world: World): number;
  /** Where the craft is at `px`, `t` ms into the crossing. */
  pathAt(course: Course, px: number, t: number): Pose;
  /**
   * Anything behind the craft and its intake, like the car's bridge, drawn before them;
   * `remainingMs` is how long the crossing has left, for fading out.
   */
  drawScene?(ctx: CanvasRenderingContext2D, course: Course, t: number, remainingMs: number): void;
  /** The craft itself, centred at (x, y) and turned by `tilt`, `t` ms into the crossing. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, t: number): void;
}
