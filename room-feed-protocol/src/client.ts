import type { ChatEvent, EventType, GiftEvent, LikeEvent, RoomEvent } from './events';
import {
  connectRoomFeed,
  GiftCounter,
  likeCount,
  type RoomFeedSocket,
  type RoomFeedStatus,
} from './stream';

/** Cancels what `schedule` set up. */
type Cancel = () => void;

export interface RoomFeedClientOptions {
  port: number;
  roomId: string;
  /** Reconnect this long after an error or a drop. Without it, the client stays down. */
  retryMs?: number;
  /** Opens the WebSocket; tests pass a fake. */
  openSocket?: (url: string) => RoomFeedSocket;
  /** setTimeout by default; tests pass a fake clock. */
  schedule?: (run: () => void, ms: number) => Cancel;
  /** Counts new gifts across a combo's repeated messages. */
  gifts?: GiftCounter;
}

const defaultSchedule = (run: () => void, ms: number): Cancel => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

type Handlers<T extends unknown[]> = Set<(...args: T) => void>;

/**
 * One live room's room-feed stream. Add handlers with `onComment`, `onGift`, `onLike` and
 * `onStatus`, then `connect()`; it subscribes only to the event types that have handlers.
 * Each `on…` returns a function that removes the handler.
 *
 *     const client = new RoomFeedClient({ port: 8757, roomId: '123', retryMs: 5000 });
 *     client.onGift((gift, newGifts) => …);
 *     client.connect();
 *     …
 *     client.close();
 */
export class RoomFeedClient {
  private readonly status: Handlers<[RoomFeedStatus, string | undefined]> = new Set();
  private readonly comments: Handlers<[ChatEvent]> = new Set();
  private readonly giftHandlers: Handlers<[GiftEvent, number]> = new Set();
  private readonly likes: Handlers<[LikeEvent, number]> = new Set();
  private readonly options: RoomFeedClientOptions;
  private readonly schedule: (run: () => void, ms: number) => Cancel;
  private readonly gifts: GiftCounter;
  private disconnect: (() => void) | null = null;
  private cancelRetry: Cancel | null = null;

  constructor(options: RoomFeedClientOptions) {
    this.options = options;
    this.schedule = options.schedule ?? defaultSchedule;
    this.gifts = options.gifts ?? new GiftCounter();
  }

  onStatus(handler: (status: RoomFeedStatus, detail?: string) => void): () => void {
    return add(this.status, handler);
  }

  /** Chat messages that carry text. */
  onComment(handler: (event: ChatEvent) => void): () => void {
    return add(this.comments, handler);
  }

  /**
   * Every gift message, with how many new gifts it adds. Douyin repeats a combo's messages,
   * so that's 0 for repeats; count by it, not by messages.
   */
  onGift(handler: (event: GiftEvent, newGifts: number) => void): () => void {
    return add(this.giftHandlers, handler);
  }

  /** Every like message, with how many taps it carries (Douyin batches a few). */
  onLike(handler: (event: LikeEvent, count: number) => void): () => void {
    return add(this.likes, handler);
  }

  /** Opens the stream, closing any open one first. */
  connect(): void {
    this.stop();
    const types: EventType[] = [];
    if (this.comments.size) types.push('chat');
    if (this.giftHandlers.size) types.push('gift');
    if (this.likes.size) types.push('like');
    const { port, roomId, openSocket } = this.options;
    this.disconnect = connectRoomFeed(
      port,
      roomId,
      {
        onStatus: (status, detail) => {
          for (const h of this.status) h(status, detail);
          if (status === 'error' || status === 'closed') this.retry();
        },
        onEvent: (event) => this.dispatch(event),
      },
      types,
      openSocket,
    );
  }

  /** Closes the stream and stops retrying. Handlers stay, so `connect()` can reopen it. */
  close(): void {
    this.stop();
  }

  private stop(): void {
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.disconnect?.();
    this.disconnect = null;
  }

  private retry(): void {
    const { retryMs } = this.options;
    if (retryMs === undefined) return;
    this.cancelRetry?.();
    this.cancelRetry = this.schedule(() => this.connect(), retryMs);
  }

  private dispatch(event: RoomEvent): void {
    // An older room-feed may send these without the fields the types promise, so check.
    if (event.type === 'chat') {
      if (typeof event.data?.content !== 'string') return;
      for (const h of this.comments) h(event);
    } else if (event.type === 'gift') {
      if (typeof event.data?.giftId !== 'string') return;
      const newGifts = this.gifts.add(event);
      for (const h of this.giftHandlers) h(event, newGifts);
    } else if (event.type === 'like') {
      const count = likeCount(event);
      for (const h of this.likes) h({ ...event, data: event.data ?? {} }, count);
    }
  }
}

function add<T extends unknown[]>(handlers: Handlers<T>, handler: (...args: T) => void) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
