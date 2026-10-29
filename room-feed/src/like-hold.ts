import type { LikeAnswer } from '@dy-apps/room-feed-protocol';
import { LikeTally } from './like-tally';

/** How often a held key sends keydown again, about as often as a held key repeats. */
const LIKE_REPEAT_MS = 100;
/** How many likes a second of holding gives, as measured on 2026-10-29: for when the counter doesn't show. */
const GUESSED_LIKES_PER_SECOND = 5;
/** The longest one like holds the key, whatever the counter says. */
const MAX_LIKE_MS = 60_000;

/** The page, as far as holding the like key needs it. */
export interface LikeSurface {
  /** Clicks the player, so the keys go to it and not to the chat box (where they'd be typed). */
  focusPlayer(): Promise<void>;
  /** Presses the like key (again, if it's down: a held key repeats keydown). */
  keyDown(): Promise<void>;
  keyUp(): Promise<void>;
  /** The number on Douyin's like counter, or null when it doesn't show. */
  counter(): Promise<number | null>;
  /** Whether the page shows Douyin's 手速太快了, its notice for liking too fast. */
  saysTooFast(): Promise<boolean>;
}

export interface LikeHoldOptions {
  /** Date.now by default. */
  now?: () => number;
  /** Waits this many ms; setTimeout by default. */
  wait?: (ms: number) => Promise<void>;
}

/**
 * Holds Douyin's like key, as a held key does, a keydown every LIKE_REPEAT_MS, until the counter
 * by the heart has added up to `likes` (see LikeTally), and lets go at once when the page says
 * 手速太快了: Douyin's limit, a hard stop. Without a counter, it guesses from the time held
 * (GUESSED_LIKES_PER_SECOND); either way, never longer than MAX_LIKE_MS. The key is let go of
 * whatever happens.
 */
export class LikeHold {
  private readonly now: () => number;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(
    private readonly surface: LikeSurface,
    options: LikeHoldOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** About how many likes went, how long the key was held, and whether 手速太快了 cut it short. */
  async hold(likes: number): Promise<Omit<LikeAnswer, 'ok'>> {
    const { surface } = this;
    await surface.focusPlayer();
    const tally = new LikeTally(await surface.counter());
    const start = this.now();
    const liked = (heldMs: number) =>
      tally.counting ? tally.count : Math.round((heldMs / 1000) * GUESSED_LIKES_PER_SECOND);
    let tooFast = false;
    await surface.keyDown();
    try {
      while (liked(this.now() - start) < likes && this.now() - start < MAX_LIKE_MS) {
        await this.wait(LIKE_REPEAT_MS);
        if (await surface.saysTooFast()) {
          tooFast = true;
          break;
        }
        tally.see(await surface.counter());
        await surface.keyDown();
      }
    } finally {
      await surface.keyUp().catch(() => {});
    }
    const heldMs = this.now() - start;
    // The likes of the last keydowns may show only now.
    tally.see(await surface.counter());
    return { liked: liked(heldMs), heldMs, tooFast };
  }
}
