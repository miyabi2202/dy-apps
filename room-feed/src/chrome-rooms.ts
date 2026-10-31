import { chromium, type Browser } from 'playwright-core';
import { BROWSER_ARGS, hideAutomation, USER_AGENT } from './chrome';
import { VIEWPORT } from './douyin/page-map';
import { browserCookies } from './login-file';
import { LivePage } from './page/live-page';
import type { OpenRoomPage } from './room-page';

export interface ChromeOptions {
  executablePath: string;
  headless: boolean;
  /** The saved login's cookies (`k=v; k=v`), read on every open; null when not logged in. */
  cookie: () => string | null;
  /** Where a screenshot of the whole page goes when something covers the chat box; none if unset. */
  shotsDir?: string;
  /** 0 ≤ x < 1, for the pause in each page step (see Pace); Math.random by default. */
  random?: () => number;
}

/**
 * Opens room pages in one Chrome, started on the first open and again if it dies. Each page
 * gets a fresh context with the saved login, so a reopened page starts clean.
 */
export class ChromeRooms {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly options: ChromeOptions) {}

  readonly open: OpenRoomPage = async (roomId, handlers) => {
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
      return await LivePage.open(
        page,
        roomId,
        handlers,
        this.options.shotsDir,
        this.options.random ?? Math.random,
      );
    } catch (e) {
      await context.close().catch(() => {});
      throw e;
    }
  };

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
      args: [
        ...BROWSER_ARGS,
        '--autoplay-policy=no-user-gesture-required',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--mute-audio',
      ],
    });
    return this.browser;
  }
}
