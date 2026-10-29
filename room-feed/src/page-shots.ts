import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright-core';

/** A rectangle of the page, in CSS pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pictures of the room page: the whole page kept in `shotsDir` as evidence, and the player alone. */
export class PageShots {
  /** `shotsDir` is where a picture of the whole page goes; none are kept if unset. */
  constructor(
    private readonly page: Page,
    private readonly shotsDir?: string,
  ) {}

  /** The whole visible page as a PNG in `shotsDir`; its path, or null with no `shotsDir`. */
  async save(name: string): Promise<string | null> {
    if (!this.shotsDir) return null;
    await mkdir(this.shotsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = join(this.shotsDir, `${stamp}-${name}.png`);
    await this.page.screenshot({ path, timeout: 10_000 });
    return path;
  }

  /** Just the player: the page's largest video, else its largest canvas, else the whole page. */
  async player(): Promise<Uint8Array> {
    const clip = await this.playerBox();
    return this.page.screenshot({
      type: 'jpeg',
      quality: 80,
      timeout: 10_000,
      ...(clip ? { clip } : {}),
    });
  }

  /** Where the player is: the page's largest video, else its largest canvas; null for neither. */
  playerBox(): Promise<Box | null> {
    // No named functions in here: tsx (esbuild's keepNames) would add a __name the page lacks.
    return this.page.evaluate(() => {
      for (const selector of ['video', 'canvas']) {
        let best: { x: number; y: number; width: number; height: number } | null = null;
        for (const el of document.querySelectorAll(selector)) {
          const r = el.getBoundingClientRect();
          const x = Math.max(r.left, 0);
          const y = Math.max(r.top, 0);
          const width = Math.min(r.right, innerWidth) - x;
          const height = Math.min(r.bottom, innerHeight) - y;
          if (width > 0 && height > 0 && (!best || width * height > best.width * best.height)) {
            best = { x, y, width, height };
          }
        }
        // Anything small is an avatar or a gift animation, not the player.
        if (best && best.width * best.height > innerWidth * innerHeight * 0.1) return best;
      }
      return null;
    });
  }
}
