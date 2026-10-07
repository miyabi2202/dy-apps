import type { Intake, Openings } from './craft';

/** A mouth at the tie point: icons fly straight in, and the ones dropped are spat back out. */
export class Mouth implements Intake {
  readonly reach = 0;

  openings(tieX: number, tieY: number): Openings {
    return { inX: tieX, inY: tieY, outX: tieX, outY: tieY };
  }

  draw(): void {}
}
