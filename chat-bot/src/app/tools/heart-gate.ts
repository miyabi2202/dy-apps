import type { SendHeart } from '../ports';

/** How many minutes after one 小心心 the next may go, asked for or not. */
export const HEART_COOLDOWN_MINUTES = 4;
/** The same, in ms. */
export const HEART_COOLDOWN_MS = HEART_COOLDOWN_MINUTES * 60_000;

/** How one try went: `tooSoon` (with how long is left) when one went within the cooldown, else room-feed's answer. */
export type HeartTry = { result: 'tooSoon'; waitMs: number } | Awaited<ReturnType<SendHeart>>;

/**
 * The one way a 小心心 goes, whichever tool sends it (`send_heart`, asked for; `send_happy_heart`,
 * unasked): one in HEART_COOLDOWN_MS at most, counted from the last one sent. The slot is taken as
 * a try starts, so two at once send one, and given back when nothing went (too few diamonds, a
 * failure). Kept in memory: a restart starts afresh.
 */
export class HeartGate {
  /** When the last one went, or is going now; null before the first. */
  private sentAt: number | null = null;

  constructor(
    private readonly sendHeart: SendHeart,
    private readonly now: () => number = Date.now,
  ) {}

  /** Throws what room-feed threw, the slot given back. */
  async send(): Promise<HeartTry> {
    const last = this.sentAt;
    const start = this.now();
    if (last !== null && start - last < HEART_COOLDOWN_MS) {
      return { result: 'tooSoon', waitMs: HEART_COOLDOWN_MS - (start - last) };
    }
    this.sentAt = start;
    try {
      const sent = await this.sendHeart();
      if (sent.result !== 'sent') this.sentAt = last;
      return sent;
    } catch (err) {
      this.sentAt = last;
      throw err;
    }
  }
}
