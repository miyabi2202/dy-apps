import { type Course, OVERSHOOT } from './craft';

/** Where a flying craft starts to climb away, as a fraction of the width, and by how much. */
const CLIMB_FROM = 0.7;
const CLIMB = 90;

/**
 * The path of something that flies over: level across the pile, then climbing away along a
 * parabola towards the top right. The height gained so far, and the angle of the climb
 * (negative: nose up) for a craft that points along it.
 */
export function climbAway(course: Course, px: number): { climb: number; tilt: number } {
  const run = (1 - CLIMB_FROM) * course.width + OVERSHOOT;
  const over = (px - CLIMB_FROM * course.width) / run;
  if (over <= 0) return { climb: 0, tilt: 0 };
  return { climb: over * over * CLIMB, tilt: -Math.atan((2 * over * CLIMB) / run) };
}
