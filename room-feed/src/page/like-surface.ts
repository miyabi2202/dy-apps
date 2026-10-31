import type { Page } from 'playwright-core';
import type { LikeSurface } from '../like-hold';
import type { PageShots } from '../page-shots';

/** The Playwright side of holding the like key: the player and Douyin's like counter. */
export class PageLikeSurface implements LikeSurface {
  constructor(
    private readonly page: Page,
    private readonly shots: Pick<PageShots, 'playerBox'>,
  ) {}

  async playerShown(): Promise<boolean> {
    return (await this.shots.playerBox()) !== null;
  }

  /** Clicks the middle of the player (if it's still there). */
  async clickPlayer(): Promise<void> {
    const box = await this.shots.playerBox();
    if (box) await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  blurFocus(): Promise<void> {
    return this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }

  keyDown(): Promise<void> {
    return this.page.keyboard.down('z');
  }

  keyUp(): Promise<void> {
    return this.page.keyboard.up('z');
  }

  /**
   * The number on Douyin's like counter, the 「x<N>」 by the heart while liking (a span in an
   * element reading x and it), or null when it doesn't show. Found by its text: the class names
   * are hashed.
   */
  counter(): Promise<number | null> {
    return this.page
      .evaluate(() => {
        for (const span of Array.from(document.querySelectorAll('span'))) {
          const shown = /^[x×]\s*(\d+)$/.exec(span.parentElement?.textContent?.trim() ?? '');
          if (shown && span.textContent?.trim() === shown[1]) return Number(shown[1]);
        }
        return null;
      })
      .catch(() => null);
  }

  /** Whether the page shows Douyin's 手速太快了, its notice for liking too fast. */
  saysTooFast(): Promise<boolean> {
    return this.page
      .evaluate(() => document.body.innerText.includes('手速太快了'))
      .catch(() => false);
  }
}
