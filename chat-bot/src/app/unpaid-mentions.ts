import type { Heard } from '../core/prompt';
import type { IncomingChat } from '../core/room-events';

/** A mention waiting for its asker to send a gift and pay for it. */
export interface Unpaid {
  chat: IncomingChat;
  question: string;
  /** When it was kept. */
  at: number;
  /** For what the bot would say to them unprompted, rather than an @. */
  unprompted?: Heard;
  /** The room's own command to answer it with, by id. */
  command?: string;
}

export interface UnpaidMentionsOptions {
  /** A mention is answered if its asker sends a gift within this long. */
  waitMs?: number;
  now?: () => number;
}

/**
 * Each viewer's last mention they couldn't pay for, by user id, kept `waitMs` (5 minutes) for a
 * gift that pays for it.
 */
export class UnpaidMentions {
  private readonly unpaid = new Map<string, Unpaid>();
  private readonly waitMs: number;
  private readonly now: () => number;

  constructor(options: UnpaidMentionsOptions = {}) {
    this.waitMs = options.waitMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  /** Keeps `mention` as `userId`'s, in place of the one before. */
  keep(userId: string, mention: Omit<Unpaid, 'at'>): void {
    const at = this.now();
    // Only a gift removes an entry, so those that nobody came back for are dropped here.
    for (const [id, { at: since }] of this.unpaid) {
      if (at - since > this.waitMs) this.unpaid.delete(id);
    }
    this.unpaid.set(userId, { ...mention, at });
  }

  /** `userId`'s kept mention, now that they sent a gift, unless it waited too long; it's done with. */
  claim(userId: string): Unpaid | undefined {
    const unpaid = this.unpaid.get(userId);
    if (!unpaid) return undefined;
    this.unpaid.delete(userId);
    return this.now() - unpaid.at > this.waitMs ? undefined : unpaid;
  }
}
