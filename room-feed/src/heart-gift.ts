import type { HeartResult } from '@dy-apps/room-feed-protocol';
import { PageActionError } from './errors';
import { Pace } from './pace';
import { closeRightPanel, type RightPanel } from './right-panel';

/** The gift it sends, by its name in the gift panel's search: 1 diamond. */
export const HEART_GIFT = '小心心';
/** What one 小心心 costs. */
const HEART_PRICE = 1;
/** How long the balance is watched after the click, for the diamond to go. */
const BALANCE_DROP_MS = 5000;
/** How often the balance is looked at meanwhile. */
const BALANCE_LOOK_MS = 500;
/** How long the panel is given to settle before its × is clicked. */
const PANEL_SETTLE_MS = 1500;

/**
 * The page, as far as sending a 小心心 needs it, the panel on the right among it. Each `waitFor…`
 * throws when what it waits for doesn't show in time.
 */
export interface GiftPanelSurface extends RightPanel {
  /** The diamonds by the gift bar's 充值, or null when they don't show. */
  balance(): Promise<number | null>;
  /** Waits for the gift bar's 「更多」. */
  waitForMore(): Promise<void>;
  /** Clicks 「更多」, which opens the gift panel. */
  clickMore(): Promise<void>;
  /** Waits for the gift panel. */
  waitForPanel(): Promise<void>;
  /** Whether the panel's search box shows (it may still be open from the last time). */
  searchShown(): Promise<boolean>;
  /** Waits for the panel's search icon. */
  waitForSearchIcon(): Promise<void>;
  /** Clicks the search icon, which shows the search box. */
  clickSearchIcon(): Promise<void>;
  /** Waits for the search box. */
  waitForSearchBox(): Promise<void>;
  /** Types `text` into the search box, replacing what's there. */
  typeSearch(text: string): Promise<void>;
  /** Waits for a gift tile named `name`. */
  waitForResult(name: string): Promise<void>;
  /** Clicks the tile named `name`, which sends one at once (it turns into 连击 then, so it's clicked once only). */
  clickResult(name: string): Promise<void>;
}

export interface HeartGiftOptions {
  /** Date.now by default. */
  now?: () => number;
  /** How each click and the typing are paced (wait, pause, act); real timers by default. */
  pace?: Pace;
}

/**
 * Sends the streamer one 小心心 (1 diamond) from the gift panel: 更多, the search icon, 小心心
 * typed in, its result clicked, each a Pace step: what it acts on seen first, then a pause. The
 * balance by 充值 tells whether it went: `sent` with the diamonds left, or null when the balance
 * doesn't show; `notEnough`, having done nothing, when there's less than a diamond. Throws when the
 * balance doesn't drop after the click. The panel is closed afterwards.
 */
export class HeartGift {
  private readonly now: () => number;
  private readonly pace: Pace;

  constructor(
    private readonly surface: GiftPanelSurface,
    options: HeartGiftOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.pace = options.pace ?? new Pace();
  }

  async send(): Promise<HeartResult> {
    const { surface, pace } = this;
    const before = await surface.balance();
    if (before !== null && before < HEART_PRICE) {
      return { result: 'notEnough', diamonds: before, price: HEART_PRICE };
    }
    await closeRightPanel(surface, pace);
    await pace.step(
      () => surface.waitForMore(),
      () => surface.clickMore(),
    );
    try {
      await surface.waitForPanel();
      if (!(await surface.searchShown())) {
        await pace.step(
          () => surface.waitForSearchIcon(),
          () => surface.clickSearchIcon(),
        );
      }
      await pace.step(
        () => surface.waitForSearchBox(),
        () => surface.typeSearch(HEART_GIFT),
      );
      await pace.step(
        () => surface.waitForResult(HEART_GIFT),
        () => surface.clickResult(HEART_GIFT),
      );
      return { result: 'sent', diamondsLeft: await this.balanceAfter(before) };
    } finally {
      await pace.wait(PANEL_SETTLE_MS);
      await closeRightPanel(surface, pace);
    }
  }

  /** The balance once it's below `before`; null when there's none to watch. */
  private async balanceAfter(before: number | null): Promise<number | null> {
    if (before === null) return this.surface.balance();
    const until = this.now() + BALANCE_DROP_MS;
    while (this.now() < until) {
      await this.pace.wait(BALANCE_LOOK_MS);
      const balance = await this.surface.balance();
      if (balance !== null && balance < before) return balance;
    }
    throw new PageActionError(`点了${HEART_GIFT}，钻石没少（还是 ${before} 钻），可能没送出去`);
  }
}
