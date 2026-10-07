/** @jest-environment node */
import { bridge, Hypercar } from '../removal/hypercar/hypercar';

const course = { width: 416, height: 708, altitude: 300, crossMs: 3000 };

describe('Hypercar', () => {
  it('leaves the left ramp along its slope, peaks, and lands on the lower right half', () => {
    const car = new Hypercar();
    const { run, rise, gap, drop, apex } = bridge(course.width);
    const grade = rise / run;

    // Up the left ramp: from its foot at the edge to its top at the gap.
    expect(car.pathAt(course, 0).py).toBeCloseTo(course.altitude + rise);
    const takeoff = car.pathAt(course, run);
    expect(takeoff.py).toBeCloseTo(course.altitude);
    expect(takeoff.tilt).toBeCloseTo(-Math.atan(grade));

    // The arc starts off at the ramp's angle, rises above the left top, and comes down to
    // the right top, which is lower.
    const justOff = car.pathAt(course, run + 1);
    expect(justOff.tilt).toBeCloseTo(-Math.atan(grade), 1);
    let peak = Infinity;
    for (let px = run; px <= run + gap; px += 1) peak = Math.min(peak, car.pathAt(course, px).py);
    expect(peak).toBeCloseTo(course.altitude - apex, 0);
    const landing = car.pathAt(course, run + gap);
    expect(landing.py).toBeCloseTo(course.altitude + drop);
    expect(landing.tilt).toBeGreaterThan(Math.atan(grade));

    // Down the right half to its foot at the edge, settling onto the ramp's angle.
    expect(car.pathAt(course, run + gap + run / 2).tilt).toBeCloseTo(Math.atan(grade));
    expect(car.pathAt(course, course.width).py).toBeCloseTo(course.altitude + drop + rise);

    // The course leaves room for the jump and for the lower landing.
    expect(car.minY(course)).toBeGreaterThan(apex);
    expect(car.sag(course)).toBe(drop);
  });
});
