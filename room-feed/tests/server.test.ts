import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { RoomEvent, RoomGoneReason, RoomStatus } from '@dy-apps/room-feed-protocol';
import { RoomError } from '../src/errors';
import { createRoomFeedServer, type RoomFeedServer, type ServedRoom } from '../src/server';

class FakeRoom implements ServedRoom {
  readonly roomId = '123';
  status: RoomStatus = 'connecting';
  chats: string[] = [];
  likes: number[] = [];
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
  like(likes: number) {
    this.likes.push(likes);
    return Promise.resolve({
      liked: Math.min(likes, 50),
      heldMs: likes * 200,
      tooFast: likes > 50,
    });
  }
  lamps = 0;
  sendFansLamp() {
    this.lamps += 1;
    return Promise.resolve(
      this.lamps > 1 ? { result: 'already' as const } : { result: 'sent' as const },
    );
  }
  diamonds = 3;
  sendHeart() {
    if (this.diamonds < 1) {
      return Promise.resolve({ result: 'notEnough' as const, diamonds: this.diamonds, price: 1 });
    }
    this.diamonds -= 1;
    return Promise.resolve({ result: 'sent' as const, diamondsLeft: this.diamonds });
  }
  balance() {
    return Promise.resolve(this.diamonds);
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

  it('gives the likes asked, a whole number from 1 up to MAX_LIKES', async () => {
    const post = (body: unknown) =>
      fetch(`http://${base}/api/rooms/123/like`, { method: 'POST', body: JSON.stringify(body) });

    expect(await (await post({ likes: 20 })).json()).toEqual({
      ok: true,
      liked: 20,
      heldMs: 4000,
      tooFast: false,
    });
    expect(await (await post({ likes: 200 })).json()).toMatchObject({ liked: 50, tooFast: true });
    for (const likes of [0, 201, 2.5, '5', undefined]) {
      expect((await post({ likes })).status).toBe(400);
    }
    expect(room.likes).toEqual([20, 200]);
  });

  it("sends the fans lamp, and says when today's was already sent", async () => {
    const post = () => fetch(`http://${base}/api/rooms/123/fans-lamp`, { method: 'POST' });
    expect(await (await post()).json()).toEqual({ ok: true, result: 'sent' });
    expect(await (await post()).json()).toEqual({ ok: true, result: 'already' });
  });

  it('sends a 小心心 and says how many diamonds are left, which the balance then shows', async () => {
    const res = await fetch(`http://${base}/api/rooms/123/heart`, { method: 'POST' });
    expect(await res.json()).toEqual({ ok: true, result: 'sent', diamondsLeft: 2 });
    const balance = await fetch(`http://${base}/api/rooms/123/balance`);
    expect(await balance.json()).toEqual({ diamonds: 2 });
  });

  it('answers a 小心心 it had too few diamonds for as notEnough, with the numbers, not an error', async () => {
    room.diamonds = 0;
    const res = await fetch(`http://${base}/api/rooms/123/heart`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: 'notEnough', diamonds: 0, price: 1 });
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
