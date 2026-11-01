import type { Page } from 'playwright-core';
import { Pace } from '@dy-apps/douyin-chrome';
import { PAGE_WAIT, roomUrl } from '../douyin/page-map';

/**
 * A live room's page HTML, for the streamer's sec_uid (see douyin/room-meta.ts): a pause, the
 * room's address opened, the page given a moment to settle.
 */
export function pageRoomHtml(page: Page, pace: Pace) {
  return async (roomId: string): Promise<string> => {
    await pace.afterSeen(() =>
      page
        .goto(roomUrl(roomId), { waitUntil: 'domcontentloaded', timeout: PAGE_WAIT.load })
        .then(() => {}),
    );
    await pace.wait(PAGE_WAIT.settle);
    return page.content();
  };
}
