import type { Page } from 'playwright-core';
import type { SearchSurface } from '../app/topic-search';
import {
  COMMENT_PANEL,
  COMMENTS_CLOSE,
  DOUYIN_HOME,
  PAGE_WAIT,
  RELATED_SEARCHES,
  SEARCH_FILTER_MENU,
  SEARCH_FILTERS,
  SEARCH_INPUT,
  SEARCH_RESULT,
  searchResultOf,
  type SearchFilter,
} from '../douyin/page-map';
import {
  clickCloseOrEscape,
  clickPostCommentButton,
  clickRepliesButton,
  dismissGuide,
  waitForCommentsOrButton,
  waitForGuide,
  pageBlocked,
  waitForRepliesButton,
  waitForShown,
} from './page-helpers';

/** The Playwright side of douyin.com's search: one wait and one act per target, no pauses, no decisions. */
export class PageSearchSurface implements SearchSurface {
  constructor(private readonly page: Page) {}

  async openHome(): Promise<void> {
    await this.page.goto(DOUYIN_HOME, { waitUntil: 'domcontentloaded', timeout: PAGE_WAIT.load });
  }

  blocked() {
    return pageBlocked(this.page);
  }

  waitForSearchBox(): Promise<void> {
    return waitForShown(this.page, SEARCH_INPUT, PAGE_WAIT.searchBox);
  }

  async clickSearchBox(): Promise<void> {
    await this.page.locator(SEARCH_INPUT).first().click({ timeout: PAGE_WAIT.searchBox });
  }

  async typeAndSearch(topic: string): Promise<void> {
    // Pressed on the box, which focuses it first: ⌘A on the page when the click left the focus
    // elsewhere selected the whole page and the topic went nowhere (seen on a topic run, 2026-11-01).
    const box = this.page.locator(SEARCH_INPUT).first();
    await box.press('ControlOrMeta+A');
    await this.page.keyboard.insertText(topic);
    await box.press('Enter');
  }

  private filterMenu() {
    return this.page.getByText(SEARCH_FILTER_MENU, { exact: true }).first();
  }

  waitForFilterMenu(): Promise<void> {
    return this.filterMenu().waitFor({ state: 'visible', timeout: PAGE_WAIT.filter });
  }

  async openFilterMenu(): Promise<void> {
    await this.filterMenu().hover({ timeout: PAGE_WAIT.filter });
  }

  private filter(filter: SearchFilter) {
    return this.page.getByText(SEARCH_FILTERS[filter], { exact: true }).first();
  }

  waitForFilter(filter: SearchFilter): Promise<void> {
    return this.filter(filter).waitFor({ state: 'visible', timeout: PAGE_WAIT.filter });
  }

  async clickFilter(filter: SearchFilter): Promise<void> {
    await this.filter(filter).click({ timeout: PAGE_WAIT.filter });
  }

  waitForResults(): Promise<void> {
    return waitForShown(this.page, SEARCH_RESULT, PAGE_WAIT.content);
  }

  async shownPosts(): Promise<string[]> {
    const ids = await this.page
      .locator(SEARCH_RESULT)
      .evaluateAll((tiles) => tiles.map((tile) => tile.id));
    return ids.map((id) => id.replace(/^waterfall_item_/, '')).filter(Boolean);
  }

  relatedSearches(): Promise<string[]> {
    return this.page.locator(RELATED_SEARCHES).allInnerTexts();
  }

  /** The tile of post `id` (the grid names each by its post), else the `index`th. */
  private tile(index: number, id?: string) {
    return id
      ? this.page.locator(searchResultOf(id)).first()
      : this.page.locator(SEARCH_RESULT).nth(index);
  }

  waitForPost(index: number, id?: string): Promise<void> {
    return this.tile(index, id).waitFor({ state: 'visible', timeout: PAGE_WAIT.content });
  }

  async clickPost(index: number, id?: string): Promise<void> {
    await this.tile(index, id).click({ timeout: PAGE_WAIT.content });
  }

  waitForGuide(): Promise<void> {
    return waitForGuide(this.page);
  }

  dismissGuide(): Promise<void> {
    return dismissGuide(this.page);
  }

  waitForCommentsOrButton(): Promise<'comments' | 'button'> {
    return waitForCommentsOrButton(this.page);
  }

  clickCommentButton(): Promise<void> {
    return clickPostCommentButton(this.page);
  }

  waitForComments(): Promise<void> {
    return waitForShown(this.page, COMMENT_PANEL, PAGE_WAIT.comments);
  }

  waitForClose(): Promise<void> {
    return waitForShown(this.page, COMMENTS_CLOSE, PAGE_WAIT.comments);
  }

  clickClose(): Promise<void> {
    return clickCloseOrEscape(this.page, COMMENTS_CLOSE);
  }
  pressEscape(): Promise<void> {
    return this.page.keyboard.press('Escape');
  }

  waitForReplies(index: number): Promise<void> {
    return waitForRepliesButton(this.page, index);
  }

  clickReplies(index: number): Promise<void> {
    return clickRepliesButton(this.page, index);
  }
}
