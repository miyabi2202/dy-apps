/**
 * Client for DyHub's WebSocket event stream (ws://localhost:<port>/ws?roomId=…&types=…).
 * DyHub runs on the streamer's machine and normalises Douyin live-room messages into
 * DanmakuEvent. This only parses the protocol; it does not touch the game engine.
 */

/** DyHub's own default port, shown as a hint only. */
export const DYHUB_PORT_HINT = '8757';
export const DYHUB_EVENT_TYPES = ['chat', 'gift'] as const;

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

export function dyhubUrl(port: number, roomId: string): string {
  return `ws://localhost:${port}/ws?roomId=${roomId}&types=${DYHUB_EVENT_TYPES.join(',')}`;
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

export interface DyhubHandlers {
  onStatus(status: DyhubStatus, detail?: string): void;
  onEvent(event: DyhubEvent): void;
}

/**
 * Open a DyHub stream for one room. DyHub starts collecting the room if needed and
 * reports progress with __connecting / __connected / __error frames.
 * Returns a function that closes the connection.
 */
export function connectDyhub(port: number, roomId: string, handlers: DyhubHandlers): () => void {
  let ws: WebSocket;
  try {
    ws = new WebSocket(dyhubUrl(port, roomId));
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
