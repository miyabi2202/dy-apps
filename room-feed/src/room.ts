import { normalize } from './douyin/normalize';
import type { RawProtoMessage } from './douyin/proto';
import type {
  RoomEvent,
  RoomGoneReason,
  RoomInfoAnswer,
  RoomMeta,
  RoomStatus,
} from '@dy-apps/room-feed-protocol';
import type { OpenRoomPage, RoomPage } from './room-page';

/** A request the room can't do now, with the HTTP status to answer it with. */
export class RoomError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

/** What a room page's open throws when the stream has ended (or not started): nothing to wait for. */
export class RoomEndedError extends Error {}

/** Cancels what `schedule` set up. */
type Cancel = () => void;

export interface RoomOptions {
  roomId: string;
  open: OpenRoomPage;
  /** setTimeout by default; tests pass a fake clock. */
  schedule?: (run: () => void, ms: number) => Cancel;
  now?: () => number;
  log?: (line: string) => void;
  /** Reload the page when no push frame came this long after opening it (the room isn't live). */
  liveTimeoutMs?: number;
  /** Waits before reopening, one per failure in a row; the last repeats. */
  retryMs?: readonly number[];
  /** At least this long between two chats, so Douyin's risk control isn't set off. */
  chatIntervalMs?: number;
  /** How long a sent chat may take to come back in the push stream. */
  echoTimeoutMs?: number;
}

const defaultSchedule = (run: () => void, ms: number): Cancel => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

/** Ids seen lately, so a message Douyin sends twice (on a reconnect, say) goes out once. */
class RecentIds {
  private readonly seen = new Set<string>();

  constructor(private readonly capacity: number) {}

  /** False the first time an id is seen. */
  has(id: string): boolean {
    if (this.seen.has(id)) return true;
    this.seen.add(id);
    // A Set iterates in insertion order, so the first is the oldest.
    if (this.seen.size > this.capacity) this.seen.delete(this.seen.values().next().value!);
    return false;
  }
}

/**
 * The one live room this room-feed serves. It keeps the room page open: when the chat connection
 * drops, the page closes or no push frame comes, it reopens the page, waiting a little longer
 * each time in a row.
 */
export class Room {
  readonly roomId: string;
  private readonly open: OpenRoomPage;
  private readonly schedule: NonNullable<RoomOptions['schedule']>;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly liveTimeoutMs: number;
  private readonly retryMs: readonly number[];
  private readonly chatIntervalMs: number;
  private readonly echoTimeoutMs: number;

  private status: RoomStatus = 'connecting';
  private page: RoomPage | null = null;
  private meta: RoomMeta | null = null;
  /** Bumped on each open and reopen; handlers of an older page check it and stay quiet. */
  private attempt = 0;
  private failures = 0;
  private cancelTimer: Cancel | null = null;
  private stopped = false;
  private readonly seen = new RecentIds(200_000);
  private readonly eventListeners = new Set<(event: RoomEvent) => void>();
  private readonly statusListeners = new Set<(status: RoomStatus) => void>();
  private readonly goneListeners = new Set<(why: string, reason: RoomGoneReason) => void>();
  private chatQueue: Promise<unknown> = Promise.resolve();
  private lastChatAt = -Infinity;

  constructor(options: RoomOptions) {
    this.roomId = options.roomId;
    this.open = options.open;
    this.schedule = options.schedule ?? defaultSchedule;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? console.log;
    this.liveTimeoutMs = options.liveTimeoutMs ?? 60_000;
    this.retryMs = options.retryMs ?? [5_000, 15_000, 30_000, 60_000];
    this.chatIntervalMs = options.chatIntervalMs ?? 3_000;
    this.echoTimeoutMs = options.echoTimeoutMs ?? 8_000;
  }

  start(): void {
    void this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.cancelTimer?.();
    const page = this.page;
    this.page = null;
    await page?.close();
  }

  info(): Omit<RoomInfoAnswer['room'], 'login'> {
    return { roomId: this.roomId, status: this.status, meta: this.meta };
  }

  /** Returns a function that removes the listener. */
  onEvent(listener: (event: RoomEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Called on every change of status. Returns a function that removes the listener. */
  onStatus(listener: (status: RoomStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Called once when the room stops for good: its stream has ended (`ended`), or the page showed
   * another room (`wrongRoom`). room-feed exits then, instead of reopening. Returns a function
   * that removes the listener.
   */
  onGone(listener: (why: string, reason: RoomGoneReason) => void): () => void {
    this.goneListeners.add(listener);
    return () => this.goneListeners.delete(listener);
  }

  /**
   * Sends a chat as the logged-in account. Chats queue, `chatIntervalMs` apart; `echoed` tells
   * whether it came back in the push stream, which is how we know Douyin took it.
   */
  sendChat(text: string): Promise<{ echoed: boolean }> {
    const run = this.chatQueue.then(() => this.doSendChat(text));
    this.chatQueue = run.catch(() => {});
    return run;
  }

  streamUrl(): string | null {
    return this.livePage().streamUrl();
  }

  screenshot(): Promise<Uint8Array> {
    return this.livePage().screenshot();
  }

  private livePage(): RoomPage {
    if (this.status !== 'live' || !this.page) {
      throw new RoomError('直播间的弹幕连接还没建立', 409);
    }
    return this.page;
  }

  private async doSendChat(text: string): Promise<{ echoed: boolean }> {
    const wait = this.lastChatAt + this.chatIntervalMs - this.now();
    if (wait > 0) await new Promise<void>((resolve) => this.schedule(resolve, wait));
    const page = this.livePage();
    let cancelTimeout: Cancel = () => {};
    let unsubscribe = () => {};
    const echo = new Promise<boolean>((resolve) => {
      cancelTimeout = this.schedule(() => resolve(false), this.echoTimeoutMs);
      unsubscribe = this.onEvent((event) => {
        if (event.type === 'chat' && event.data.content === text) resolve(true);
      });
    });
    try {
      this.lastChatAt = this.now();
      await page.typeChat(text);
      return { echoed: await echo };
    } finally {
      cancelTimeout();
      unsubscribe();
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const attempt = ++this.attempt;
    const current = () => attempt === this.attempt && !this.stopped;
    this.log(`[room-feed] 正在打开直播间 ${this.roomId}…`);
    let page: RoomPage;
    try {
      page = await this.open(this.roomId, {
        onPush: (messages) => {
          if (current()) this.receive(messages);
        },
        onClosed: (why) => {
          // Before the open returns, the failed open itself reports it.
          if (current() && this.page) this.reopen(why);
        },
        onWrongRoom: (why) => {
          if (current()) void this.end(why, 'wrongRoom');
        },
      });
    } catch (e) {
      if (!current()) return;
      if (e instanceof RoomEndedError) void this.end(e.message, 'ended');
      else this.reopen(`打不开直播间页面：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!current()) {
      await page.close();
      return;
    }
    this.page = page;
    this.meta = page.meta ?? this.meta;
    if (this.status !== 'live') {
      this.cancelTimer = this.schedule(
        () => this.reopen('一直没收到弹幕推送（可能还没开播）'),
        this.liveTimeoutMs,
      );
    }
  }

  private reopen(why: string): void {
    this.cancelTimer?.();
    this.attempt++;
    const page = this.page;
    this.page = null;
    void page?.close();
    this.setStatus('connecting');
    const delay = this.retryMs[Math.min(this.failures, this.retryMs.length - 1)] ?? 5_000;
    this.failures++;
    this.log(`[room-feed] ${why}，${Math.round(delay / 1000)} 秒后重新打开直播间`);
    this.cancelTimer = this.schedule(() => void this.connect(), delay);
  }

  private async end(why: string, reason: RoomGoneReason): Promise<void> {
    this.log(`[room-feed] ${why}，不再重新打开直播间`);
    await this.stop();
    for (const listener of this.goneListeners) listener(why, reason);
  }

  private receive(messages: RawProtoMessage[]): void {
    if (this.status !== 'live') {
      this.cancelTimer?.();
      this.cancelTimer = null;
      this.failures = 0;
      this.setStatus('live');
      this.log(`[room-feed] 已连上直播间 ${this.roomId} 的弹幕`);
    }
    for (const message of messages) {
      const event = normalize(message, this.roomId, this.now());
      if (!event || (event.id && this.seen.has(event.id))) continue;
      for (const listener of this.eventListeners) listener(event);
    }
  }

  private setStatus(status: RoomStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
