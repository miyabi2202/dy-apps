import type { Gift } from './room-events';

/** A gift and when it came. */
export interface GiftLine extends Gift {
  ts: number;
}

/** The room's gifts from the last `windowMs` (5 minutes), oldest first, at most `size`. */
export class RecentGifts {
  private lines: GiftLine[] = [];

  constructor(
    private readonly windowMs = 5 * 60_000,
    private readonly size = 30,
  ) {}

  add(ts: number, gift: Gift): void {
    this.lines.push({ ...gift, ts });
    if (this.lines.length > this.size) this.lines.splice(0, this.lines.length - this.size);
  }

  /** Those from the last `windowMs` before `now`. */
  recent(now: number): GiftLine[] {
    this.lines = this.lines.filter((line) => now - line.ts <= this.windowMs);
    return [...this.lines];
  }
}
