import type { Page } from 'playwright-core';
import type { FeedSurface } from '../app/feed-scroller';
import {
  COMMENT_BUTTON,
  COMMENT_PANEL,
  COMMENTS_CLOSE,
  DOUYIN_HOME,
  FEED_PLAYER,
  NEXT_VIDEO_KEY,
  PAGE_WAIT,
} from '../douyin/page-map';
import { clickCloseOrEscape, pageBlocked, waitForShown } from './page-helpers';

/** The Playwright side of the 推荐 feed: one wait and one act per target, no pauses, no decisions. */
export class PageFeedSurface implements FeedSurface {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto(DOUYIN_HOME, { waitUntil: 'domcontentloaded', timeout: PAGE_WAIT.load });
  }

  blocked() {
    return pageBlocked(this.page);
  }

  waitForPlayer(): Promise<void> {
    return waitForShown(this.page, FEED_PLAYER, PAGE_WAIT.content);
  }

  async goToNext(): Promise<void> {
    await this.page.keyboard.press(NEXT_VIDEO_KEY);
  }

  waitForCommentButton(): Promise<void> {
    return waitForShown(this.page, COMMENT_BUTTON, PAGE_WAIT.comments);
  }

  async clickCommentButton(): Promise<void> {
    await this.page.locator(COMMENT_BUTTON).first().click({ timeout: PAGE_WAIT.comments });
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
