// Opens one douyin.com page with the saved login (room-feed's ChromeRooms opens a live-room page).
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { VIEWPORT } from '../douyin/page-map';
import { BROWSER_ARGS, browserCookies, hideAutomation, USER_AGENT } from '@dy-apps/douyin-chrome';

export interface BrowseChromeOptions {
  executablePath: string;
  headless: boolean;
  /** The saved login's cookies (`k=v; k=v`); null when not logged in. */
  cookie: () => string | null;
}

/** One browsing session: a context with the saved login and the one page the run works in. */
export interface BrowseSession {
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

/** Chrome, started on the first open, with a fresh context (the saved login's cookies) for each. */
export class BrowseChrome {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly options: BrowseChromeOptions) {}

  async open(): Promise<BrowseSession> {
    const browser = await this.launch();
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: VIEWPORT,
      locale: 'zh-CN',
    });
    try {
      await hideAutomation(context);
      const cookie = this.options.cookie();
      if (cookie) await context.addCookies(browserCookies(cookie));
      const page = await context.newPage();
      return { context, page, close: () => context.close().catch(() => {}) };
    } catch (e) {
      await context.close().catch(() => {});
      throw e;
    }
  }

  async close(): Promise<void> {
    const browser = await this.browser?.catch(() => null);
    this.browser = null;
    await browser?.close().catch(() => {});
  }

  private async launch(): Promise<Browser> {
    const running = await this.browser?.catch(() => null);
    if (running?.isConnected()) return running;
    this.browser = chromium.launch({
      executablePath: this.options.executablePath,
      headless: this.options.headless,
      args: [...BROWSER_ARGS, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
    });
    return this.browser;
  }
}
