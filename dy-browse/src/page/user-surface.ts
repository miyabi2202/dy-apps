import type { Page } from 'playwright-core';
import type { UserSurface } from '../app/user-posts';
import { COMMENT_PANEL, COMMENTS_CLOSE, PAGE_WAIT, USER_POST, userUrl } from '../douyin/page-map';
import { clickCloseOrEscape, pageBlocked, waitForShown, wheelDown } from './page-helpers';

/** The Playwright side of a user's page: one wait and one act per target, no pauses, no decisions. */
export class PageUserSurface implements UserSurface {
  constructor(private readonly page: Page) {}

  async open(secUid: string): Promise<void> {
    await this.page.goto(userUrl(secUid), {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_WAIT.load,
    });
  }

  blocked() {
    return pageBlocked(this.page);
  }

  waitForPosts(): Promise<void> {
    return waitForShown(this.page, USER_POST, PAGE_WAIT.content);
  }

  scrollPosts(): Promise<void> {
    return wheelDown(this.page);
  }

  waitForPost(index: number): Promise<void> {
    return this.page
      .locator(USER_POST)
      .nth(index)
      .waitFor({ state: 'visible', timeout: PAGE_WAIT.content });
  }

  async clickPost(index: number): Promise<void> {
    await this.page.locator(USER_POST).nth(index).click({ timeout: PAGE_WAIT.content });
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
