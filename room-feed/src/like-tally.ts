/**
 * Adds up Douyin's like counter, the 「x<N>」 by the heart while liking, over one hold. The counter
 * can start again from 1 partway (the combo broke), so a drop is a new run: the old run's last
 * number is kept and counting goes on from the new one. It needn't be exact: the last few likes
 * of a run may never be read, and that's fine.
 */
export class LikeTally {
  private kept: number;
  private last: number;
  private read = false;

  /**
   * `before` is the counter before pressing, if it shows: left from an earlier hold, or one going
   * on that the new likes add to. Either way, only what comes after it counts.
   */
  constructor(before: number | null) {
    this.last = before ?? 0;
    this.kept = -this.last;
  }

  /** What the counter shows now; null when it doesn't. */
  see(shown: number | null): void {
    if (shown === null) return;
    this.read = true;
    if (shown < this.last) this.kept += this.last;
    this.last = shown;
  }

  /** The likes counted so far. */
  get count(): number {
    return this.kept + this.last;
  }

  /** Whether the counter has shown at all since pressing. */
  get counting(): boolean {
    return this.read;
  }
}
