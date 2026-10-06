import {
  connectDyhub,
  GiftCounter,
  likeCount,
  type DyhubChatData,
  type DyhubEvent,
  type DyhubEventType,
  type DyhubGiftData,
  type DyhubSocket,
  type DyhubStatus,
} from './dyhub';

/** A chat message. */
export type DyhubCommentEvent = Omit<DyhubEvent, 'type' | 'data'> & {
  type: 'chat';
  data: DyhubChatData;
};

export type DyhubGiftEvent = Omit<DyhubEvent, 'type' | 'data'> & {
  type: 'gift';
  data: DyhubGiftData;
};

export type DyhubLikeEvent = Omit<DyhubEvent, 'type' | 'data'> & {
  type: 'like';
  data: { count?: number; total?: number };
};

/** A connection's last status, for showing it; `idle` before connecting. */
export interface DyhubState {
  status: DyhubStatus | 'idle';
  detail?: string;
}

/** Cancels what `schedule` set up. */
type Cancel = () => void;

export interface DyhubClientOptions {
  port: number;
  roomId: string;
  /** Reconnect this long after an error or a drop. Without it, the client stays down. */
  retryMs?: number;
  /** Opens the WebSocket; tests pass a fake. */
  openSocket?: (url: string) => DyhubSocket;
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
 * One live room's DyHub stream. Add handlers with `onComment`, `onGift`, `onLike` and
 * `onStatus`, then `connect()`; it subscribes only to the event types that have handlers.
 * Each `on…` returns a function that removes the handler.
 *
 *     const client = new DyhubClient({ port: 8757, roomId: '123', retryMs: 5000 });
 *     client.onGift((gift, newGifts) => …);
 *     client.connect();
 *     …
 *     client.close();
 */
export class DyhubClient {
  private readonly status: Handlers<[DyhubStatus, string | undefined]> = new Set();
  private readonly comments: Handlers<[DyhubCommentEvent]> = new Set();
  private readonly giftHandlers: Handlers<[DyhubGiftEvent, number]> = new Set();
  private readonly likes: Handlers<[DyhubLikeEvent, number]> = new Set();
  private readonly options: DyhubClientOptions;
  private readonly schedule: (run: () => void, ms: number) => Cancel;
  private readonly gifts: GiftCounter;
  private disconnect: (() => void) | null = null;
  private cancelRetry: Cancel | null = null;

  constructor(options: DyhubClientOptions) {
    this.options = options;
    this.schedule = options.schedule ?? defaultSchedule;
    this.gifts = options.gifts ?? new GiftCounter();
  }

  onStatus(handler: (status: DyhubStatus, detail?: string) => void): () => void {
    return add(this.status, handler);
  }

  /** Chat messages that carry text. */
  onComment(handler: (event: DyhubCommentEvent) => void): () => void {
    return add(this.comments, handler);
  }

  /**
   * Every gift message, with how many new gifts it adds. Douyin repeats a combo's messages,
   * so that's 0 for repeats; count by it, not by messages.
   */
  onGift(handler: (event: DyhubGiftEvent, newGifts: number) => void): () => void {
    return add(this.giftHandlers, handler);
  }

  /** Every like message, with how many taps it carries (Douyin batches a few). */
  onLike(handler: (event: DyhubLikeEvent, count: number) => void): () => void {
    return add(this.likes, handler);
  }

  /** Opens the stream, closing any open one first. */
  connect(): void {
    this.stop();
    const types: DyhubEventType[] = [];
    if (this.comments.size) types.push('chat');
    if (this.giftHandlers.size) types.push('gift');
    if (this.likes.size) types.push('like');
    const { port, roomId, openSocket } = this.options;
    this.disconnect = connectDyhub(
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

  private dispatch(event: DyhubEvent): void {
    if (event.type === 'chat') {
      if (typeof event.data?.content !== 'string') return;
      for (const h of this.comments) h(event as DyhubCommentEvent);
    } else if (event.type === 'gift') {
      if (typeof event.data?.giftId !== 'string') return;
      const newGifts = this.gifts.add(event);
      for (const h of this.giftHandlers) h(event as DyhubGiftEvent, newGifts);
    } else if (event.type === 'like') {
      const count = likeCount(event);
      for (const h of this.likes) h({ ...event, data: event.data ?? {} } as DyhubLikeEvent, count);
    }
  }
}

function add<T extends unknown[]>(handlers: Handlers<T>, handler: (...args: T) => void) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
