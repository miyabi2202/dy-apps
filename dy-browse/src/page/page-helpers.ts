import type { Page } from 'playwright-core';
import {
  BLOCK_SELECTORS,
  COMMENT_ITEM,
  COMMENT_PANEL,
  GUIDE_MASK,
  GUIDE_OK,
  PAGE_WAIT,
  POST_COMMENT_BUTTON,
  REPLIES_BUTTON,
} from '../douyin/page-map';

/** Which wall (captcha, login) the page shows, if any. */
export async function pageBlocked(page: Page): Promise<'captcha' | 'login' | null> {
  for (const kind of ['captcha', 'login'] as const) {
    const shown = await page
      .locator(BLOCK_SELECTORS[kind])
      .first()
      .isVisible()
      .catch(() => false);
    if (shown) return kind;
  }
  return null;
}

/** Waits for the first element matching `selector` to show; throws when it doesn't in time. */
export function waitForShown(page: Page, selector: string, timeout: number): Promise<void> {
  return page.locator(selector).first().waitFor({ state: 'visible', timeout });
}

/** Opens a post's comments' close ×, or presses Escape when there's no ×. */
export async function clickCloseOrEscape(page: Page, selector: string): Promise<void> {
  const close = page.locator(selector).first();
  await close.click({ timeout: PAGE_WAIT.comments }).catch(async () => {
    await page.keyboard.press('Escape');
  });
}

/** One wheel turn down the page: what a person's scroll sends. */
export async function wheelDown(page: Page, dy = 1200): Promise<void> {
  await page.mouse.move(720, 500);
  await page.mouse.wheel(0, dy);
}

/** The 展开回复 button under the comment at `index` of the open post. */
function repliesButton(page: Page, index: number) {
  return page.locator(COMMENT_ITEM).nth(index).getByText(REPLIES_BUTTON).first();
}

/** Waits for the 展开回复 button under comment `index`; throws when it doesn't show in time. */
export function waitForRepliesButton(page: Page, index: number): Promise<void> {
  return repliesButton(page, index).waitFor({ state: 'visible', timeout: PAGE_WAIT.replies });
}

export async function clickRepliesButton(page: Page, index: number): Promise<void> {
  await repliesButton(page, index).click({ timeout: PAGE_WAIT.replies });
}

/** The 我知道了 of the guide over the first video opened. */
function guideOk(page: Page) {
  return page.locator(GUIDE_MASK).getByText(GUIDE_OK, { exact: true }).first();
}

/** Waits for the guide's 我知道了; throws when it doesn't show (soon). */
export function waitForGuide(page: Page): Promise<void> {
  return guideOk(page).waitFor({ state: 'visible', timeout: PAGE_WAIT.guide });
}

export async function dismissGuide(page: Page): Promise<void> {
  await guideOk(page).click({ timeout: PAGE_WAIT.guide });
}

/** What an opened post shows first: its comments, or its comment button with them closed. */
export async function waitForCommentsOrButton(page: Page): Promise<'comments' | 'button'> {
  const comments = page.locator(COMMENT_PANEL).first();
  const button = page.locator(POST_COMMENT_BUTTON).first();
  await comments.or(button).first().waitFor({ state: 'visible', timeout: PAGE_WAIT.comments });
  return (await comments.isVisible().catch(() => false)) ? 'comments' : 'button';
}

export async function clickPostCommentButton(page: Page): Promise<void> {
  await page.locator(POST_COMMENT_BUTTON).first().click({ timeout: PAGE_WAIT.comments });
}
