import { RunStopped } from '../core/errors';
import { parseRoomMeta } from '@dy-apps/douyin-chrome';

/**
 * The streamer's sec_uid: the `--sec-uid` given, or, without one, read from the live room's page
 * the way room-feed reads it (`parseRoomMeta`). `roomHtml` opens the page; it's only called when
 * needed.
 */
export async function resolveSecUid(
  roomId: string,
  given: string | null,
  roomHtml: (roomId: string) => Promise<string>,
): Promise<string> {
  if (given) return given;
  const meta = parseRoomMeta(await roomHtml(roomId));
  if (!meta?.secUid) {
    throw new RunStopped(
      `读不到房间 ${roomId} 主播的 sec_uid：这个房间可能没开播。用 --sec-uid <值> 直接给。`,
    );
  }
  return meta.secUid;
}
