import type { Locator, Page } from 'playwright-core';
import {
  CLOSE_ICON,
  DIAMOND_BALANCE,
  DOWNLOAD_GUIDE_CLOSE,
  PAGE_WAIT,
  RIGHT_PANEL_CLOSE_SVG,
} from '../douyin/page-map';

/**
 * What Douyin's page has around whichever panel is open, which the 粉丝团 and gift surfaces both
 * use: the right panel's ×, the download popup's ×, and the diamonds by the gift bar's 充值. The
 * Playwright side of `RightPanel` and `DownloadGuide`; it neither pauses nor decides.
 */
export class PageChrome {
  constructor(private readonly page: Page) {}

  /** The × of the panel on the right (the 粉丝团 one, the gift one, …). */
  private rightPanelClose(): Locator {
    return this.page
      .locator(RIGHT_PANEL_CLOSE_SVG)
      .filter({ has: this.page.locator(CLOSE_ICON) })
      .first();
  }

  /** The × of the 「下载电脑客户端」 popup. */
  private guideClose(): Locator {
    return this.page.locator(DOWNLOAD_GUIDE_CLOSE).first();
  }

  /** Whether the right panel's × shows, which it does while one is open. */
  closeShown(): Promise<boolean> {
    return this.rightPanelClose()
      .isVisible()
      .catch(() => false);
  }

  clickClose(): Promise<void> {
    return this.rightPanelClose().click({ timeout: PAGE_WAIT.close });
  }

  /** Whether the download popup's × shows: the popup is in the page all along, hidden until it shows. */
  guideShown(): Promise<boolean> {
    return this.guideClose()
      .isVisible()
      .catch(() => false);
  }

  clickGuideClose(): Promise<void> {
    return this.guideClose().click({ timeout: PAGE_WAIT.close });
  }

  /** The diamonds by the gift bar's 充值, or null when they don't show. */
  async balance(): Promise<number | null> {
    const text = await this.page
      .locator(DIAMOND_BALANCE)
      .first()
      .innerText({ timeout: PAGE_WAIT.balance })
      .catch(() => '');
    const shown = /^\s*(\d+)\s*$/.exec(text);
    return shown ? Number(shown[1]) : null;
  }
}
