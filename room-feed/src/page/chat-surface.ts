import type { Locator, Page } from 'playwright-core';
import type { ChatSurface } from '../chat-box';
import { CHAT_INPUT, PAGE_WAIT } from '../douyin/page-map';

/** The Playwright side of the chat box: Douyin's Slate editor, as the page map describes it. */
export class PageChatSurface implements ChatSurface {
  private readonly box: Locator;

  constructor(private readonly page: Page) {
    this.box = page.locator(CHAT_INPUT);
  }

  waitForBox(): Promise<void> {
    return this.box.waitFor({ state: 'visible', timeout: PAGE_WAIT.chatBox });
  }

  async clickBox(): Promise<void> {
    // A popup's mask can cover the box and take the click: a viewer's card, opened when the click
    // that starts the player lands on a streamer's tile in a PK. Typing needs only the focus.
    await this.box.click({ timeout: PAGE_WAIT.chatBoxClick }).catch(async () => {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.box.focus();
    });
  }

  async text(): Promise<string> {
    const text = await this.box.innerText();
    return text.replace(/[\u200b\s]/g, '');
  }

  async selectAllAndDelete(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.page.keyboard.press('Backspace');
  }

  async backspaceFromEnd(times: number): Promise<void> {
    const { keyboard } = this.page;
    await keyboard.press('ControlOrMeta+ArrowDown');
    await keyboard.press('End');
    for (let i = 0; i < times; i++) await keyboard.press('Backspace');
  }

  async typeAndSend(text: string): Promise<void> {
    await this.page.keyboard.insertText(text);
    await this.page.keyboard.press('Enter');
  }
}
