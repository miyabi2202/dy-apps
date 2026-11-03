import type { Locator, Page } from 'playwright-core';
import {
  ANCHOR_CARD,
  CLOSE_ICON,
  DIAMOND_BALANCE,
  DOWNLOAD_GUIDE_CLOSE,
  PAGE_WAIT,
  RIGHT_PANEL_CLOSE_SVG,
} from '../douyin/page-map';

/** How far from the page's edge the click that closes a streamer's card lands. */
const OFF_CARD_MARGIN = 10;

/**
 * What Douyin's page has around whichever panel is open, which the 粉丝团 and gift surfaces both
 * use: the right panel's ×, the download popup's ×, a PK streamer's card, and the diamonds by the
 * gift bar's 充值. The Playwright side of `RightPanel`, `DownloadGuide` and `AnchorCard`; it neither
 * pauses nor decides.
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

  /** Whether a PK streamer's card shows. */
  cardShown(): Promise<boolean> {
    return this.page
      .locator(ANCHOR_CARD)
      .first()
      .isVisible()
      .catch(() => false);
  }

  /**
   * Clicks the card's mask, which covers the page: at the page's edge beside the card (the left
   * one, or the right when the card is near it), level with the card's middle.
   */
  async clickOffCard(): Promise<void> {
    const box = await this.page.locator(ANCHOR_CARD).first().boundingBox();
    if (!box) return;
    const width = this.page.viewportSize()?.width ?? box.x + box.width + OFF_CARD_MARGIN * 2;
    const x = box.x > OFF_CARD_MARGIN * 2 ? OFF_CARD_MARGIN : width - OFF_CARD_MARGIN;
    await this.page.mouse.click(x, box.y + box.height / 2);
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
