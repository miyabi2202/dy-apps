import { DEFAULT_PORT, type RoomFeedStatus } from '@dy-apps/room-feed-protocol';

/** room-feed's own default port, shown as a hint only. */
export const ROOM_FEED_PORT_HINT = String(DEFAULT_PORT);
/** The site route of the room-feed install guide, for apps to link to. */
export const ROOM_FEED_GUIDE_PATH = '/room-feed-windows';

/** What to show for each connection status; `idle` is before connecting. */
export const ROOM_FEED_STATUS_TEXT: Record<RoomFeedStatus | 'idle', string> = {
  idle: '未连接',
  opening: '连接中…',
  roomConnecting: '房间连接中…',
  ready: '已就绪',
  error: '连接失败',
  closed: '已断开',
};
