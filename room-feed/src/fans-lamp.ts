import type { FansLampResult } from '@dy-apps/room-feed-protocol';
import { closeDownloadGuide, type DownloadGuide } from './download-guide';
import { PageActionError } from './errors';
import { Pace } from './pace';
import { closeRightPanel, type RightPanel } from './right-panel';

/** What the 灯牌 costs: with fewer diamonds, nothing is clicked. */
const LAMP_PRICE = 2;
/** How long one opening of the 粉丝团 panel may take to load and answer. */
const FANS_PANEL_MS = 20_000;
/** How many times the panel is opened before giving up: a fresh one may not be stuck on a notice. */
const FANS_PANEL_TRIES = 2;
/** How often the panel's frames are looked at while it loads. */
const PANEL_LOOK_MS = 500;
/** How long the panel is given to settle before its × is clicked. */
const PANEL_SETTLE_MS = 1500;

/**
 * What the steps look for in a panel frame: the 「我知道了」 `notice` that blocks the panel, the
 * `join` button (加入粉丝团), the `send` button of the 灯牌, and the `sent` line that says today's
 * 灯牌 is sent. How each is found on Douyin's page is the surface's business.
 */
export type PanelTarget = 'notice' | 'join' | 'send' | 'sent';

/** One frame of the open 粉丝团 panel (it's Lynx, in frames of its own). */
export interface PanelFrame {
  /** Whether the frame shows `target`. */
  has(target: PanelTarget): Promise<boolean>;
  /** Clicks `target`; throws when there's nothing to click. */
  click(target: PanelTarget): Promise<void>;
}

/** The page, as far as the 灯牌 steps need it, the panel on the right and the download popup among it. */
export interface FansLampSurface extends RightPanel, DownloadGuide {
  /** The diamonds by the gift bar's 充值, or null when they don't show. */
  balance(): Promise<number | null>;
  /** Whether the header's 「关注」 shows, which it does only while the streamer isn't followed. */
  followVisible(): Promise<boolean>;
  clickFollow(): Promise<void>;
  /** Waits for the header's 粉丝团 button to show; throws when it doesn't in time. */
  waitForPanelButton(): Promise<void>;
  /** Clicks the 粉丝团 button, which opens the panel (or closes it, if it's open). */
  openPanel(): Promise<void>;
  /** The frames of the page now, the panel's among them. */
  panelFrames(): PanelFrame[];
}

export interface FansLampOptions {
  /** Date.now by default. */
  now?: () => number;
  /** How each click is paced (wait, pause, act); real timers by default. */
  pace?: Pace;
}

/**
 * Sends today's 粉丝团灯牌 (2 diamonds) in three steps, each skipped when it's done already:
 * follows the streamer, joins the 粉丝团 (1 diamond), sends the 灯牌. Joining is tried once,
 * however many times the panel is opened. With fewer than LAMP_PRICE diamonds it does nothing
 * and answers `notEnough`; a balance that doesn't show doesn't stop it. Every click is a Pace
 * step: what it clicks seen first, then a pause; the download popup is closed before each, if it
 * shows.
 */
export class FansLamp {
  private readonly now: () => number;
  private readonly pace: Pace;

  constructor(
    private readonly surface: FansLampSurface,
    options: FansLampOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.pace = options.pace ?? new Pace();
  }

  /** `already` when today's 灯牌 was sent before, `notEnough` with too few diamonds; throws when the panel shows neither. */
  async send(): Promise<FansLampResult> {
    const diamonds = await this.surface.balance();
    if (diamonds !== null && diamonds < LAMP_PRICE) {
      return { result: 'notEnough', diamonds, price: LAMP_PRICE };
    }
    await closeDownloadGuide(this.surface, this.pace);
    await closeRightPanel(this.surface, this.pace);
    await this.followStreamer();
    await this.joinFansClub();
    return { result: await this.sendLamp() };
  }

  /** Step 1: clicks the header's 「关注」, which shows only while the streamer isn't followed. */
  private async followStreamer(): Promise<void> {
    if (!(await this.surface.followVisible())) return;
    await closeDownloadGuide(this.surface, this.pace);
    await this.pace.afterSeen(() => this.surface.clickFollow());
  }

  /**
   * Step 2: joins the 粉丝团 when its panel offers 加入粉丝团, which closes the panel; a member's
   * panel shows the 灯牌 instead, and there's nothing to do. A panel that shows neither in time
   * is left to step 3.
   */
  private async joinFansClub(): Promise<void> {
    await this.inPanel(async (frame) => {
      if (await frame.has('join')) {
        await this.pace.afterSeen(() => frame.click('join'));
        return 'joined';
      }
      return (await this.showsLamp(frame)) ? 'member' : null;
    });
  }

  /**
   * Step 3: clicks the 灯牌's button, or answers `already` when the panel says today's is sent
   * (the button is gone then, and the 灯牌's line greyed out). Up to FANS_PANEL_TRIES openings: a
   * 「我知道了」 notice that doesn't go away can keep one from the 灯牌.
   */
  private async sendLamp(): Promise<'sent' | 'already'> {
    for (let i = 0; i < FANS_PANEL_TRIES; i++) {
      const result = await this.inPanel(async (frame) => {
        if (await frame.has('sent')) return 'already' as const;
        if (!(await frame.has('send'))) return null;
        await this.pace.afterSeen(() => frame.click('send'));
        return 'sent' as const;
      });
      if (result) return result;
    }
    throw new PageActionError('粉丝团面板里没找到送灯牌');
  }

  /** Whether the panel shows the 灯牌: its button, or that today's is sent. */
  private async showsLamp(frame: PanelFrame): Promise<boolean> {
    return (await frame.has('send')) || (await frame.has('sent'));
  }

  /**
   * Opens the 粉丝团 panel and asks `look` of each of its frames every half second, for
   * FANS_PANEL_MS at most, closing a 「我知道了」 notice whenever one shows: what `look` found, or
   * null. The panel is closed afterwards (see closeRightPanel).
   */
  private async inPanel<T>(look: (frame: PanelFrame) => Promise<T | null>): Promise<T | null> {
    const { surface, pace } = this;
    await closeDownloadGuide(surface, pace);
    await pace.step(
      () => surface.waitForPanelButton(),
      () => surface.openPanel(),
    );
    try {
      const until = this.now() + FANS_PANEL_MS;
      while (this.now() < until) {
        await pace.wait(PANEL_LOOK_MS);
        await closeDownloadGuide(surface, pace);
        for (const frame of surface.panelFrames()) {
          if (await frame.has('notice')) {
            await pace.afterSeen(() => frame.click('notice').catch(() => {}));
            continue;
          }
          const found = await look(frame);
          if (found !== null) return found;
        }
      }
      return null;
    } finally {
      await pace.wait(PANEL_SETTLE_MS);
      await closeRightPanel(surface, pace);
    }
  }
}
