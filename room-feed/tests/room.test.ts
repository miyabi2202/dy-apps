import protobuf from 'protobufjs';
import type { RawProtoMessage } from '../src/douyin/proto';
import type { RoomEvent, RoomStatus } from '@dy-apps/room-feed-protocol';
import { Room, RoomError } from '../src/room';
import type { RoomPage, RoomPageHandlers } from '../src/room-page';

/** A clock that runs scheduled callbacks only when told to. */
class FakeClock {
  time = 0;
  private timers: { at: number; run: () => void; cancelled: boolean }[] = [];

  schedule = (run: () => void, ms: number) => {
    const timer = { at: this.time + ms, run, cancelled: false };
    this.timers.push(timer);
    return () => (timer.cancelled = true);
  };

  now = () => this.time;

  /** Moves time on, running what's due (and what those schedule, if due too). */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      await flush();
      const due = this.timers
        .filter((t) => !t.cancelled && t.at <= end)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.time = due.at;
      due.cancelled = true;
      due.run();
    }
    this.time = end;
    await flush();
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

class FakePage implements RoomPage {
  meta = null;
  closed = false;
  typed: string[] = [];
  stream: string | null = 'https://pull.example/stream.flv';

  constructor(readonly handlers: RoomPageHandlers) {}

  streamUrl() {
    return this.stream;
  }
  typeChat(text: string) {
    this.typed.push(text);
    return Promise.resolve();
  }
  screenshot() {
    return Promise.resolve(new Uint8Array([0xff, 0xd8]));
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

const chatType = protobuf
  .parse(
    `syntax = "proto3";
     message ChatMessage { Common common = 1; User user = 2; string content = 3; }
     message Common { uint64 createTime = 4; }
     message User { string nickName = 3; string idStr = 1029; }`,
  )
  .root.lookupType('ChatMessage');

function chat(msgId: string, content: string): RawProtoMessage {
  const payload = chatType
    .encode({
      common: { createTime: 1_700_000_000 },
      user: { nickName: '阿拂', idStr: '42' },
      content,
    })
    .finish();
  return { method: 'WebcastChatMessage', msgId, payload };
}

function setup() {
  const clock = new FakeClock();
  const pages: FakePage[] = [];
  const log: string[] = [];
  const room = new Room({
    roomId: '123',
    open: (_roomId, handlers) => {
      const page = new FakePage(handlers);
      pages.push(page);
      return Promise.resolve(page);
    },
    schedule: clock.schedule,
    now: clock.now,
    log: (line) => log.push(line),
    liveTimeoutMs: 60_000,
    retryMs: [5_000, 30_000],
    chatIntervalMs: 3_000,
    echoTimeoutMs: 8_000,
  });
  const events: RoomEvent[] = [];
  const statuses: RoomStatus[] = [];
  room.onEvent((event) => events.push(event));
  room.onStatus((status) => statuses.push(status));
  return { clock, pages, room, events, statuses, log };
}

describe('Room', () => {
  it('goes live on the first push frame and sends each message once', async () => {
    const { clock, pages, room, events, statuses } = setup();
    room.start();
    await clock.advance(0);
    pages[0]!.handlers.onPush([chat('1', '你好'), chat('1', '你好'), chat('2', '在吗')]);

    expect(statuses).toEqual(['live']);
    expect(events.map((e) => e.type === 'chat' && e.data.content)).toEqual(['你好', '在吗']);
    expect(events[0]).toMatchObject({
      roomId: '123',
      ts: 1_700_000_000_000,
      user: { id: '42', nickname: '阿拂' },
    });
  });

  it('reopens the page when chat drops, waiting longer each time in a row', async () => {
    const { clock, pages, room, statuses } = setup();
    room.start();
    await clock.advance(0);
    pages[0]!.handlers.onPush([]);
    pages[0]!.handlers.onClosed('弹幕连接断开');

    expect(statuses).toEqual(['live', 'connecting']);
    expect(pages[0]!.closed).toBe(true);
    await clock.advance(4_999);
    expect(pages).toHaveLength(1);
    await clock.advance(1);
    expect(pages).toHaveLength(2);

    // Still no push: the second wait is longer.
    await clock.advance(60_000);
    expect(pages[1]!.closed).toBe(true);
    await clock.advance(29_999);
    expect(pages).toHaveLength(2);
    await clock.advance(1);
    expect(pages).toHaveLength(3);

    // Live again: the next drop waits the shortest time again.
    pages[2]!.handlers.onPush([]);
    pages[2]!.handlers.onClosed('弹幕连接断开');
    await clock.advance(5_000);
    expect(pages).toHaveLength(4);
  });

  it('ignores an old page once it has been replaced', async () => {
    const { clock, pages, room, events } = setup();
    room.start();
    await clock.advance(0);
    pages[0]!.handlers.onClosed('直播间页面被关闭');
    await clock.advance(5_000);

    pages[0]!.handlers.onPush([chat('1', '旧页面')]);
    pages[0]!.handlers.onClosed('直播间页面被关闭');
    expect(events).toEqual([]);
    expect(pages[1]!.closed).toBe(false);
  });

  it('refuses the stream and chat before the room is live', async () => {
    const { clock, room } = setup();
    room.start();
    await clock.advance(0);

    expect(() => room.streamUrl()).toThrow(RoomError);
    await expect(room.sendChat('hi')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('spaces chats apart and tells whether each came back', async () => {
    const { clock, pages, room } = setup();
    room.start();
    await clock.advance(0);
    const page = pages[0]!;
    page.handlers.onPush([]);

    const first = room.sendChat('第一条');
    const second = room.sendChat('第二条');
    await clock.advance(0);
    expect(page.typed).toEqual(['第一条']);
    page.handlers.onPush([chat('9', '第一条')]);
    await expect(first).resolves.toEqual({ echoed: true });

    await clock.advance(2_999);
    expect(page.typed).toEqual(['第一条']);
    await clock.advance(1);
    expect(page.typed).toEqual(['第一条', '第二条']);
    await clock.advance(8_000);
    await expect(second).resolves.toEqual({ echoed: false });
  });
});
