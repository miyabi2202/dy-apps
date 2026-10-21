/**
 * Client for room-feed's WebSocket event stream (ws://localhost:<port>/ws?roomId=…&types=…).
 * room-feed (room-feed/ in this repo) runs on the streamer's machine and turns one Douyin live
 * room's messages into events, as `@dy-apps/room-feed-protocol` describes them.
 */

import {
  DEFAULT_PORT,
  eventsUrl,
  type EventType,
  type Frame,
  type LikeEvent,
  type RoomEvent,
} from '@dy-apps/room-feed-protocol';

/** room-feed's own default port, shown as a hint only. */
export const ROOM_FEED_PORT_HINT = String(DEFAULT_PORT);
/** The site route of the room-feed install guide, for apps to link to. */
export const ROOM_FEED_GUIDE_PATH = '/room-feed-windows';
/** The events subscribed to unless a caller asks for others. */
export const ROOM_FEED_EVENT_TYPES: readonly EventType[] = ['chat', 'gift'];

/** A TCP port, 1–65535, or null. */
export function parsePort(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? port : null;
}

/** A Douyin room number: digits only (the tail of a live.douyin.com link). */
export function isRoomId(value: string): boolean {
  return /^\d+$/.test(value);
}

export type RoomFeedStatus = 'opening' | 'roomConnecting' | 'ready' | 'error' | 'closed';

/** What to show for each connection status; `idle` is before connecting. */
export const ROOM_FEED_STATUS_TEXT: Record<RoomFeedStatus | 'idle', string> = {
  idle: '未连接',
  opening: '连接中…',
  roomConnecting: '房间连接中…',
  ready: '已就绪',
  error: '连接失败',
  closed: '已断开',
};

export interface RoomFeedHandlers {
  onStatus(status: RoomFeedStatus, detail?: string): void;
  onEvent(event: RoomEvent): void;
}

/** The part of WebSocket the client uses, so tests can pass a fake. */
export interface RoomFeedSocket {
  onmessage: ((m: MessageEvent<string>) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  close(): void;
}

const openWebSocket = (url: string): RoomFeedSocket => new WebSocket(url);

/**
 * Open a room-feed stream for one room. room-feed reports the room's connection with __connecting /
 * __connected frames, and turns away a client asking for a room it doesn't serve with __error.
 * Returns a function that closes the connection. Most code wants RoomFeedClient instead.
 */
export function connectRoomFeed(
  port: number,
  roomId: string,
  handlers: RoomFeedHandlers,
  types: readonly EventType[] = ROOM_FEED_EVENT_TYPES,
  openSocket: (url: string) => RoomFeedSocket = openWebSocket,
): () => void {
  let ws: RoomFeedSocket;
  try {
    ws = openSocket(eventsUrl(port, roomId, types));
  } catch (e) {
    handlers.onStatus('error', e instanceof Error ? e.message : String(e));
    return () => {};
  }

  let failed = false;
  handlers.onStatus('opening');
  ws.onmessage = (m: MessageEvent<string>) => {
    let frame: Frame;
    try {
      frame = JSON.parse(m.data) as Frame;
    } catch {
      return;
    }
    switch (frame.type) {
      case '__hello':
        return;
      case '__connecting':
        handlers.onStatus('roomConnecting');
        return;
      case '__connected':
        handlers.onStatus('ready');
        return;
      case '__error':
        failed = true;
        handlers.onStatus('error', frame.error);
        return;
      default:
        handlers.onEvent(frame);
    }
  };
  ws.onerror = () => {
    failed = true;
    handlers.onStatus('error', `无法连接 localhost:${port}，请确认 room-feed 已启动`);
  };
  ws.onclose = () => {
    if (!failed) handlers.onStatus('closed');
  };

  return () => {
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
  };
}

/**
 * Turns room-feed gift events into "how many new gifts", like DouyinBarrageGrab does.
 * Douyin pushes several messages per send: combo progress with a growing repeatCount,
 * then a closing repeatEnd copy. They share giftId + groupId but not msgId, so room-feed's
 * own dedupe lets them all through.
 */
export class GiftCounter {
  private readonly groups = new Map<string, { count: number; seenAt: number }>();

  constructor(
    /** Forget a group this long after its last message. */
    private readonly ttlMs = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** New gifts this event adds: 0 for non-gifts, duplicates and out-of-order messages. */
  add(event: RoomEvent): number {
    if (event.type !== 'gift') return 0;
    const gift = event.data;
    const now = this.now();
    for (const [key, group] of this.groups) {
      if (now - group.seenAt > this.ttlMs) this.groups.delete(key);
    }

    const key = `${event.roomId}-${gift.giftId}-${gift.groupId ?? ''}`;
    const previous = this.groups.get(key);
    if (gift.repeatEnd && previous) {
      this.groups.delete(key);
      return 0;
    }
    const total = Math.max(1, gift.repeatCount ?? 0);
    const counted = previous?.count ?? 0;
    if (total <= counted) return 0;
    // Without a groupId there is nothing to merge on, so every message counts.
    if (gift.groupId) this.groups.set(key, { count: total, seenAt: now });
    return total - counted;
  }
}

/** How many likes one room-feed like event carries (Douyin batches a few taps). */
export function likeCount(ev: LikeEvent): number {
  // An older room-feed may send a like without data.
  const count = ev.data?.count;
  return typeof count === 'number' && count > 0 ? count : 1;
}
