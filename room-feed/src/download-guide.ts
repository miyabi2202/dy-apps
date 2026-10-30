import type { Pace } from './pace';

/**
 * Douyin's 「下载电脑客户端」 popup, which the page shows now and then (a minute or so in, or not at
 * all) over the player, where it takes the clicks meant for what's under it.
 */
export interface DownloadGuide {
  /** Whether the popup's × shows, which it does only while the popup does. */
  guideShown(): Promise<boolean>;
  /** Clicks its ×. */
  clickGuideClose(): Promise<void>;
}

/**
 * Closes the popup if it shows, as a step: its × seen, a pause, the click. A step that clicks the
 * page does this first; with no popup it does nothing.
 */
export async function closeDownloadGuide(guide: DownloadGuide, pace: Pace): Promise<void> {
  if (!(await guide.guideShown())) return;
  await pace.afterSeen(() => guide.clickGuideClose().catch(() => {}));
}
