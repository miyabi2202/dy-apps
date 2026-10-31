import type { Locator, Page } from 'playwright-core';
import {
  GIFT_PANEL,
  GIFT_SEARCH_ICON,
  GIFT_SEARCH_INPUT,
  GIFT_TILE,
  GIFTS_MORE,
  PAGE_WAIT,
} from '../douyin/page-map';
import type { GiftPanelSurface } from '../heart-gift';
import type { PageChrome } from './page-chrome';

/** How long a 小心心 step waits for what it acts on. */
const GIFT_WAIT = { timeout: PAGE_WAIT.giftStep };

/** The Playwright side of sending a 小心心: the gift bar and panel, as the page map describes them. */
export class PageGiftSurface implements GiftPanelSurface {
  private readonly more: Locator;
  private readonly panel: Locator;
  private readonly searchIcon: Locator;
  private readonly searchBox: Locator;

  constructor(
    private readonly page: Page,
    private readonly chrome: PageChrome,
  ) {
    this.more = page.locator(GIFTS_MORE).first();
    this.panel = page.locator(GIFT_PANEL);
    this.searchIcon = this.panel.locator(GIFT_SEARCH_ICON).first();
    this.searchBox = this.panel.locator(GIFT_SEARCH_INPUT).first();
  }

  closeShown(): Promise<boolean> {
    return this.chrome.closeShown();
  }

  clickClose(): Promise<void> {
    return this.chrome.clickClose();
  }

  guideShown(): Promise<boolean> {
    return this.chrome.guideShown();
  }

  clickGuideClose(): Promise<void> {
    return this.chrome.clickGuideClose();
  }

  balance(): Promise<number | null> {
    return this.chrome.balance();
  }

  waitForMore(): Promise<void> {
    return this.more.waitFor({ timeout: PAGE_WAIT.panel });
  }

  clickMore(): Promise<void> {
    return this.more.click(GIFT_WAIT);
  }

  waitForPanel(): Promise<void> {
    return this.panel.waitFor({ timeout: PAGE_WAIT.panel });
  }

  searchShown(): Promise<boolean> {
    return this.searchBox.isVisible().catch(() => false);
  }

  waitForSearchIcon(): Promise<void> {
    return this.searchIcon.waitFor(GIFT_WAIT);
  }

  clickSearchIcon(): Promise<void> {
    return this.searchIcon.click(GIFT_WAIT);
  }

  waitForSearchBox(): Promise<void> {
    return this.searchBox.waitFor(GIFT_WAIT);
  }

  typeSearch(text: string): Promise<void> {
    return this.searchBox.fill(text, GIFT_WAIT);
  }

  waitForResult(name: string): Promise<void> {
    return this.result(name).waitFor(GIFT_WAIT);
  }

  clickResult(name: string): Promise<void> {
    return this.result(name).click(GIFT_WAIT);
  }

  private result(name: string): Locator {
    return this.panel
      .locator(GIFT_TILE)
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .first();
  }
}
