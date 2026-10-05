/**
 * Client for DyHub's WebSocket event stream (ws://localhost:<port>/ws?roomId=…&types=…).
 * DyHub runs on the streamer's machine and normalises Douyin live-room messages into
 * DanmakuEvent. This only parses the protocol; it does not touch the game engine.
 */

/** DyHub's own default port, shown as a hint only. */
export const DYHUB_PORT_HINT = '8757';
/** The events subscribed to unless a caller asks for others. */
export const DYHUB_EVENT_TYPES = ['chat', 'gift'] as const;

/** Event types DyHub can stream (its DanmakuEvent `type`). */
export type DyhubEventType = 'chat' | 'gift' | 'member' | 'follow' | 'like' | 'room' | 'unknown';

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

export function dyhubUrl(
  port: number,
  roomId: string,
  types: readonly DyhubEventType[] = DYHUB_EVENT_TYPES,
): string {
  return `ws://localhost:${port}/ws?roomId=${roomId}&types=${types.join(',')}`;
}

/** Event user. Levels need miyabi2202/dyhub with payGrade/fansClub support. */
export interface DyhubUser {
  id: string;
  nickname: string;
  avatar?: string;
  /** Douyin wealth level (User.payGrade.level); missing when the message doesn't carry it. */
  payLevel?: number;
  /** The fan club shown for the user, usually this room's streamer's; missing when not a member. */
  fansClub?: { name: string; level: number; status?: number; anchorId?: string };
}

/** Subset of DyHub's DanmakuEvent that consumers rely on. */
export interface DyhubEvent {
  id: string;
  roomId: string;
  type: string;
  ts: number;
  user?: DyhubUser;
  data?: Record<string, unknown>;
}

export type DyhubStatus = 'opening' | 'roomConnecting' | 'ready' | 'error' | 'closed';

/** What to show for each connection status; `idle` is before connecting. */
export const DYHUB_STATUS_TEXT: Record<DyhubStatus | 'idle', string> = {
  idle: '未连接',
  opening: '连接中…',
  roomConnecting: '房间连接中…',
  ready: '已就绪',
  error: '连接失败',
  closed: '已断开',
};

export interface DyhubHandlers {
  onStatus(status: DyhubStatus, detail?: string): void;
  onEvent(event: DyhubEvent): void;
}

/**
 * Open a DyHub stream for one room. DyHub starts collecting the room if needed and
 * reports progress with __connecting / __connected / __error frames.
 * Returns a function that closes the connection.
 */
export function connectDyhub(
  port: number,
  roomId: string,
  handlers: DyhubHandlers,
  types: readonly DyhubEventType[] = DYHUB_EVENT_TYPES,
): () => void {
  let ws: WebSocket;
  try {
    ws = new WebSocket(dyhubUrl(port, roomId, types));
  } catch (e) {
    handlers.onStatus('error', e instanceof Error ? e.message : String(e));
    return () => {};
  }

  let failed = false;
  handlers.onStatus('opening');
  ws.onmessage = (m: MessageEvent<string>) => {
    let frame: { type?: string; error?: string };
    try {
      frame = JSON.parse(m.data) as typeof frame;
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
        handlers.onEvent(frame as DyhubEvent);
    }
  };
  ws.onerror = () => {
    failed = true;
    handlers.onStatus('error', `无法连接 localhost:${port}，请确认 DyHub 已启动`);
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

/** Gift fields DyHub sends (see its GiftEvent). Older DyHub builds omit groupId / repeatEnd. */
export interface DyhubGiftData {
  giftId: string;
  giftName?: string;
  /** Picture of the gift on Douyin's CDN. */
  giftIcon?: string;
  diamondCount?: number;
  repeatCount?: number;
  repeatEnd?: boolean;
  groupId?: string;
}

/**
 * Turns DyHub gift events into "how many new gifts", like DouyinBarrageGrab does.
 * Douyin pushes several messages per send: combo progress with a growing repeatCount,
 * then a closing repeatEnd copy. They share giftId + groupId but not msgId, so DyHub's
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
  add(event: DyhubEvent): number {
    if (event.type !== 'gift') return 0;
    const gift = event.data as unknown as DyhubGiftData;
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

/** How many likes one DyHub like event carries (Douyin batches a few taps). */
export function likeCount(ev: DyhubEvent): number {
  const count = ev.data?.count;
  return typeof count === 'number' && count > 0 ? count : 1;
}
