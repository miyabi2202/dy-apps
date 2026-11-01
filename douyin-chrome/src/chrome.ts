import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext } from 'playwright-core';

/** A desktop Chrome's user agent, for the room page and the login window. */
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Hides `navigator.webdriver`, the flag automated browsers show. */
export const BROWSER_ARGS = ['--disable-blink-features=AutomationControlled'];

function chromePaths(env: NodeJS.ProcessEnv): string[] {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    // Chrome installed for one Windows user only.
    ...(env.LOCALAPPDATA
      ? [join(env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe')]
      : []),
  ];
}

/** Where Chrome (or Chromium) is installed, or undefined. */
export function findChrome(
  exists: (path: string) => boolean = existsSync,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return chromePaths(env).find((path) => exists(path));
}

/** Runs in every page before Douyin's scripts, so they don't see an automated browser. */
export async function hideAutomation(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
}
