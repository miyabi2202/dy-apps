import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { RoomEvent, RoomGoneReason, RoomStatus } from '@dy-apps/room-feed-protocol';
import { RoomError } from '../src/room';
import { createRoomFeedServer, type RoomFeedServer, type ServedRoom } from '../src/server';

class FakeRoom implements ServedRoom {
  readonly roomId = '123';
  status: RoomStatus = 'connecting';
  chats: string[] = [];
  private readonly eventListeners = new Set<(event: RoomEvent) => void>();
  private readonly statusListeners = new Set<(status: RoomStatus) => void>();
  private readonly goneListeners = new Set<(why: string, reason: RoomGoneReason) => void>();

  info() {
    return {
      roomId: this.roomId,
      status: this.status,
      meta: { nickname: '主播', uid: '7', secUid: '', avatar: '', title: '' },
    };
  }
  onEvent(listener: (event: RoomEvent) => void) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  onStatus(listener: (status: RoomStatus) => void) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }
  onGone(listener: (why: string, reason: RoomGoneReason) => void) {
    this.goneListeners.add(listener);
    return () => this.goneListeners.delete(listener);
  }
  sendChat(text: string) {
    this.chats.push(text);
    return Promise.resolve({ echoed: true });
  }
  streamUrl(): string | null {
    if (this.status !== 'live') throw new RoomError('直播间的弹幕连接还没建立', 409);
    return 'https://pull.example/stream.flv';
  }
  screenshot() {
    return Promise.resolve(new Uint8Array([0xff, 0xd8]));
  }

  emit(event: RoomEvent) {
    for (const listener of this.eventListeners) listener(event);
  }
  gone(why: string, reason: RoomGoneReason) {
    for (const listener of this.goneListeners) listener(why, reason);
  }
  setStatus(status: RoomStatus) {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

const chat: RoomEvent = { id: '1', roomId: '123', ts: 1, type: 'chat', data: { content: '你好' } };
const like: RoomEvent = { id: '2', roomId: '123', ts: 2, type: 'like', data: { count: 3 } };

let room: FakeRoom;
let feed: RoomFeedServer;
let base: string;

beforeEach(async () => {
  room = new FakeRoom();
  feed = createRoomFeedServer(room, {
    login: () => ({ cookie: 'sessionid=x', expiresAt: 99, savedAt: 1 }),
    now: () => 5,
  });
  await new Promise<void>((resolve) => feed.server.listen(0, '127.0.0.1', resolve));
  base = `127.0.0.1:${(feed.server.address() as AddressInfo).port}`;
});

afterEach(() => feed.close());

/** A client and every frame it gets. */
async function connect(query: string) {
  const ws = new WebSocket(`ws://${base}/ws?${query}`);
  const frames: { type: string; error?: string }[] = [];
  ws.on('message', (data: Buffer) =>
    frames.push(JSON.parse(data.toString()) as { type: string; error?: string }),
  );
  const closed = new Promise<void>((resolve) => ws.on('close', () => resolve()));
  await new Promise<void>((resolve, reject) => ws.on('open', resolve).on('error', reject));
  return { ws, frames, closed };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
};

describe('the event stream', () => {
  it('greets, says the status, and sends only the types asked for', async () => {
    const { ws, frames } = await connect('roomId=123&types=chat');
    await until(() => frames.length === 2);
    room.setStatus('live');
    room.emit(like);
    room.emit(chat);
    await until(() => frames.length === 4);

    expect(frames).toEqual([
      { type: '__hello', roomId: '123', types: ['chat'], ts: 5 },
      { type: '__connecting', roomId: '123', ts: 5 },
      { type: '__connected', roomId: '123', ts: 5 },
      chat,
    ]);
    ws.close();
  });

  it('tells clients why before room-feed exits, and closes their sockets cleanly', async () => {
    const { frames, closed } = await connect('roomId=123');
    await until(() => frames.length === 2);
    room.gone('直播已结束', 'ended');
    await feed.close();
    await closed;

    expect(frames[2]).toEqual({
      type: '__ended',
      roomId: '123',
      reason: 'ended',
      detail: '直播已结束',
      ts: 5,
    });
  });

  it('turns away a client asking for another room', async () => {
    const { frames, closed } = await connect('roomId=456');
    await closed;

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ type: '__error', roomId: '456' });
    expect(frames[0]?.error).toContain('123');
  });
});

describe('the HTTP API', () => {
  it('describes the room with the login expiry', async () => {
    const res = await fetch(`http://${base}/api/rooms/123`);

    expect(await res.json()).toMatchObject({
      room: { roomId: '123', status: 'connecting', meta: { uid: '7' }, login: { expiresAt: 99 } },
    });
  });

  it('sends a trimmed chat and refuses an empty one', async () => {
    const post = (text: unknown) =>
      fetch(`http://${base}/api/rooms/123/chat`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });

    expect(await (await post('  hi ')).json()).toEqual({ ok: true, echoed: true });
    expect((await post(' ')).status).toBe(400);
    expect(room.chats).toEqual(['hi']);
  });

  it("answers a room error with the room's status code", async () => {
    const res = await fetch(`http://${base}/api/rooms/123/stream`);

    expect(res.status).toBe(409);
  });

  it('names its room when asked about another', async () => {
    const res = await fetch(`http://${base}/api/rooms/456/stream`);

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain('123');
  });
});
