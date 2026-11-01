import type { Page } from 'playwright-core';
import { BLOCK_SELECTORS, PAGE_WAIT } from '../douyin/page-map';

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
