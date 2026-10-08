/** The step it moves in, in ms: about a frame. */
const STEP_MS = 16;

/**
 * Time for a removal that moves by stepping, so it moves in steps of about a frame however far
 * apart the frames really are (a hidden tab), and nothing in its way is skipped over.
 */
export class Clock {
  /** How far it has been moved, in ms from its start. */
  t = 0;

  /** Step it on to `target` ms, calling `step` with each step's length, while `going` says so. */
  advance(target: number, step: (dt: number) => void, going: () => boolean = () => true): void {
    while (this.t < target && going()) {
      const dt = Math.min(STEP_MS, target - this.t);
      this.t += dt;
      step(dt);
    }
  }
}

/** The longest a frame counts for, in ms, so a hidden tab doesn't fling particles across the world. */
const FRAME_MAX_MS = 100;

/** How long each draw has been since the one before, for stepping particles; it is 0 while time stands still (a hit-stop). */
export class Frames {
  private last: number | null = null;

  /** The ms since the last call (at most 100); 0 the first time. */
  dt(now: number): number {
    const dt = this.last === null ? 0 : Math.min(FRAME_MAX_MS, Math.max(0, now - this.last));
    this.last = now;
    return dt;
  }
}
