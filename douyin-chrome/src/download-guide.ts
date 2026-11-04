import type { Pace } from './pace';

/**
 * The × of Douyin's 「下载电脑客户端」 popup: the svg beside its download container. The popup is in
 * the page all along, at 0×0 until it shows, on a live room's page and on search alike.
 */
export const DOWNLOAD_GUIDE_CLOSE = ':has(> [data-e2e="download-container"]) > svg';

/**
 * Douyin's 「下载电脑客户端」 popup, which the page shows now and then (a minute or so in, or not at
 * all) over its top right, where it takes the clicks and hovers meant for what's under it (a live
 * room's player, search's 筛选).
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
