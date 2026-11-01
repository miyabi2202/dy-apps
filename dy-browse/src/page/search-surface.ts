import type { Page } from 'playwright-core';
import type { SearchSurface } from '../app/topic-search';
import {
  COMMENT_PANEL,
  COMMENTS_CLOSE,
  DOUYIN_HOME,
  PAGE_WAIT,
  RELATED_SEARCHES,
  SEARCH_FILTERS,
  SEARCH_INPUT,
  SEARCH_RESULT,
  type SearchFilter,
} from '../douyin/page-map';
import { clickCloseOrEscape, pageBlocked, waitForShown } from './page-helpers';

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
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.page.keyboard.insertText(topic);
    await this.page.keyboard.press('Enter');
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

  relatedSearches(): Promise<string[]> {
    return this.page.locator(RELATED_SEARCHES).allInnerTexts();
  }

  waitForPost(index: number): Promise<void> {
    return this.page
      .locator(SEARCH_RESULT)
      .nth(index)
      .waitFor({ state: 'visible', timeout: PAGE_WAIT.content });
  }

  async clickPost(index: number): Promise<void> {
    await this.page.locator(SEARCH_RESULT).nth(index).click({ timeout: PAGE_WAIT.content });
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
}
