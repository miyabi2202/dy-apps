import { chromium } from 'playwright-core';
import { BROWSER_ARGS, hideAutomation, USER_AGENT } from './chrome';
import type { LoginFile } from './login-file';

/** Douyin has logged in once it sets one of these. */
const LOGIN_COOKIES = ['sessionid_ss', 'sessionid'];
/** Time to log in, SMS code included. */
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const POLL_MS = 1500;

export interface LoginOptions {
  executablePath: string;
  /** The window's own Chrome profile, apart from the user's. */
  profileDir: string;
  file: LoginFile;
  log?: (line: string) => void;
}

/**
 * Opens Douyin in a Chrome window for the user to log in (QR code, SMS code and sliders are all
 * Douyin's own page), waits for the login cookies and saves them. Resolves true once saved, false
 * when the window was closed or time ran out. Needs a screen.
 */
export async function login(options: LoginOptions): Promise<boolean> {
  const log = options.log ?? console.log;
  const context = await chromium.launchPersistentContext(options.profileDir, {
    executablePath: options.executablePath,
    headless: false,
    viewport: null,
    userAgent: USER_AGENT,
    locale: 'zh-CN',
    args: [...BROWSER_ARGS, '--window-size=1200,860'],
  });
  let closed = false;
  context.on('close', () => (closed = true));
  try {
    await hideAutomation(context);
    // Start logged out, or last time's account would be picked up and the window shut at once.
    await context.clearCookies();
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.bringToFront();
    log(
      '[room-feed] 请在弹出的 Chrome 窗口里登录抖音（扫码或手机验证码都可以），登录后窗口会自动关闭',
    );

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (!closed && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const cookies = await context.cookies('https://www.douyin.com').catch(() => null);
      if (!cookies) break;
      const loginCookies = cookies.filter((c) => LOGIN_COOKIES.includes(c.name) && c.value);
      if (!loginCookies.length) continue;
      // Playwright's expires is in seconds, -1 for a session cookie; the earliest one counts.
      const expiries = loginCookies.filter((c) => c.expires > 0).map((c) => c.expires * 1000);
      options.file.write(
        cookies.map((c) => `${c.name}=${c.value}`).join('; '),
        expiries.length ? Math.min(...expiries) : null,
      );
      log(`[room-feed] 登录成功，已保存到 ${options.file.path}`);
      return true;
    }
    log(
      closed
        ? '[room-feed] 登录窗口被关掉了，没有登录'
        : '[room-feed] 等了 10 分钟还没登录，先退出了',
    );
    return false;
  } finally {
    await context.close().catch(() => {});
  }
}
