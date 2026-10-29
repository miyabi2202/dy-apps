import type { Page } from 'playwright-core';
import { CHAT_INPUT } from './douyin/page-map';
import { PageActionError } from './errors';

/** The room page's chat box, typed into and cleared as a person would, by the keyboard. */
export class ChatBox {
  /**
   * `screenshot` takes a picture of the page when typing fails and gives its path (null if none
   * was taken): a popup's mask or a 禁言 notice shows in it.
   */
  constructor(
    private readonly page: Page,
    private readonly screenshot: (name: string) => Promise<string | null>,
  ) {}

  /**
   * Sent once the box is empty after Enter; whether Douyin took it, the caller sees from the echo.
   * When it fails, a picture of the page goes with the error.
   */
  async type(text: string): Promise<void> {
    try {
      await this.tryType(text);
    } catch (e) {
      const screenshot = await this.screenshot('chat-failed').catch(() => null);
      const message = e instanceof Error ? e.message : String(e);
      throw new PageActionError(message, { screenshot, cause: e });
    }
  }

  private async tryType(text: string): Promise<void> {
    const input = this.page.locator(CHAT_INPUT);
    try {
      await input.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      throw new PageActionError('找不到弹幕输入框（没有登录、被禁言，或者抖音改版了）');
    }
    // A popup's mask can cover the box and take the click: a viewer's card, opened when the click
    // that starts the player lands on a streamer's tile in a PK. Typing needs only the focus.
    await input.click({ timeout: 3000 }).catch(async () => {
      await this.page.keyboard.press('Escape').catch(() => {});
      await input.focus();
    });
    // What an earlier chat left behind would be sent with this one, so clear it first.
    await this.clear();
    await this.page.keyboard.insertText(text);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(500);
    if (await this.text()) {
      await this.clear().catch(() => {});
      throw new PageActionError('回车后输入框没有清空，弹幕可能没有发出（风控、要验证或字数超了）');
    }
  }

  /** The box's text; an empty editor holds only a zero-width placeholder. */
  private async text(): Promise<string> {
    const text = await this.page.locator(CHAT_INPUT).innerText();
    return text.replace(/[\u200b\s]/g, '');
  }

  /**
   * Slate reacts only to real input, so the keyboard clears the box rather than fill(): select
   * all and delete, then, if anything's left, Backspace from the end.
   */
  private async clear(): Promise<void> {
    const { keyboard } = this.page;
    for (let attempt = 0; attempt < 3; attempt++) {
      const left = await this.text();
      if (!left) return;
      if (attempt === 0) {
        await keyboard.press('ControlOrMeta+A');
        await keyboard.press('Backspace');
      } else {
        await keyboard.press('ControlOrMeta+ArrowDown');
        await keyboard.press('End');
        for (let i = 0; i < [...left].length + 5; i++) await keyboard.press('Backspace');
      }
    }
    if (await this.text()) throw new PageActionError('输入框里有删不掉的文字，没有发送');
  }
}
