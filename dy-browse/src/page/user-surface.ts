import type { Page } from 'playwright-core';
import type { UserSurface } from '../app/user-posts';
import {
  COMMENT_PANEL,
  COMMENTS_CLOSE,
  PAGE_WAIT,
  SERVICE_ERROR,
  SERVICE_RETRY,
  USER_POST,
  userUrl,
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
  wheelDown,
} from './page-helpers';

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

  async waitForPostsOrError(): Promise<'posts' | 'error'> {
    const posts = this.page.locator(USER_POST).first();
    const error = this.page.locator(SERVICE_ERROR).first();
    await posts.or(error).first().waitFor({ state: 'visible', timeout: PAGE_WAIT.content });
    return (await error.isVisible().catch(() => false)) ? 'error' : 'posts';
  }

  waitForRetry(): Promise<void> {
    return waitForShown(this.page, SERVICE_RETRY, PAGE_WAIT.content);
  }

  async clickRetry(): Promise<void> {
    await this.page.locator(SERVICE_RETRY).first().click({ timeout: PAGE_WAIT.content });
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
