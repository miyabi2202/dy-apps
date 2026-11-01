import type { BrowserContext } from 'playwright-core';

/**
 * Downloads a URL through the browser's own session (cookies and a Douyin referer, which the play
 * URL wants), as the media store's `download`.
 */
export function contextDownload(context: BrowserContext) {
  return async (url: string, referer: string): Promise<Uint8Array> => {
    const response = await context.request.get(url, { headers: { referer }, timeout: 60_000 });
    if (!response.ok()) throw new Error(`download ${response.status()}`);
    return new Uint8Array(await response.body());
  };
}
