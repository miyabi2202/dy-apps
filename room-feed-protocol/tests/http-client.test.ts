import { RoomFeedHttp } from '../src/http-client';

interface Call {
  url: string;
  init?: RequestInit;
}

/** A fetch that answers with `answer` and notes what it was asked. */
function setup(answer: () => Response) {
  const calls: Call[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(answer());
  }) as unknown as typeof fetch;
  const http = new RoomFeedHttp({ port: 8757, roomId: '123', fetch: fetchFn });
  return { http, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('RoomFeedHttp.sendChat', () => {
  it('posts the text as JSON and says whether it echoed', async () => {
    const { http, calls } = setup(() => json({ ok: true, echoed: true }));
    expect(await http.sendChat('你好')).toEqual({ echoed: true });
    expect(calls[0]?.url).toBe('http://localhost:8757/api/rooms/123/chat');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(calls[0]?.init?.body).toBe('{"text":"你好"}');
  });

  it('is not echoed unless the answer says exactly true', async () => {
    expect(await setup(() => json({ ok: true })).http.sendChat('x')).toEqual({ echoed: false });
  });

  it('throws room-feed’s own message, else its status', async () => {
    await expect(setup(() => json({ error: '没登录' }, 409)).http.sendChat('x')).rejects.toThrow(
      '没登录',
    );
    await expect(
      setup(() => new Response('oops', { status: 502 })).http.sendChat('x'),
    ).rejects.toThrow('room-feed answered 502');
  });
});

describe('RoomFeedHttp.like', () => {
  it('posts the likes and reads what went', async () => {
    const { http, calls } = setup(() => json({ ok: true, liked: 18, heldMs: 3500, tooFast: true }));
    expect(await http.like(20)).toEqual({ liked: 18, heldMs: 3500, tooFast: true });
    expect(calls[0]?.url).toBe('http://localhost:8757/api/rooms/123/like');
    expect(calls[0]?.init?.body).toBe('{"likes":20}');
  });

  it('fills what the answer leaves out with 0, 0 and false', async () => {
    expect(await setup(() => json({ ok: true })).http.like(5)).toEqual({
      liked: 0,
      heldMs: 0,
      tooFast: false,
    });
  });

  it('throws on a failed answer', async () => {
    await expect(setup(() => json({ error: '太快' }, 500)).http.like(5)).rejects.toThrow('太快');
    await expect(setup(() => json({}, 503)).http.like(5)).rejects.toThrow('room-feed answered 503');
  });
});

describe('RoomFeedHttp.sendFansLamp', () => {
  it('posts without a body and returns the result', async () => {
    const { http, calls } = setup(() => json({ ok: true, result: 'already' }));
    expect(await http.sendFansLamp()).toEqual({ result: 'already' });
    expect(calls[0]?.url).toBe('http://localhost:8757/api/rooms/123/fans-lamp');
    expect(calls[0]?.init).toEqual({ method: 'POST' });
  });

  it('returns notEnough with its numbers', async () => {
    const { http } = setup(() => json({ ok: true, result: 'notEnough', diamonds: 1, price: 2 }));
    expect(await http.sendFansLamp()).toEqual({ result: 'notEnough', diamonds: 1, price: 2 });
  });

  it('throws when the answer fails or has no result', async () => {
    await expect(setup(() => json({ error: '没找到' }, 500)).http.sendFansLamp()).rejects.toThrow(
      '没找到',
    );
    await expect(setup(() => json({ ok: true })).http.sendFansLamp()).rejects.toThrow(
      'room-feed answered 200',
    );
  });
});

describe('RoomFeedHttp.sendHeart', () => {
  it('posts without a body and returns sent with the diamonds left', async () => {
    const { http, calls } = setup(() => json({ ok: true, result: 'sent', diamondsLeft: 9 }));
    expect(await http.sendHeart()).toEqual({ result: 'sent', diamondsLeft: 9 });
    expect(calls[0]?.url).toBe('http://localhost:8757/api/rooms/123/heart');
    expect(calls[0]?.init).toEqual({ method: 'POST' });
    const unknown = setup(() => json({ ok: true, result: 'sent', diamondsLeft: null }));
    expect(await unknown.http.sendHeart()).toEqual({ result: 'sent', diamondsLeft: null });
  });

  it('returns notEnough with its numbers', async () => {
    const { http } = setup(() => json({ ok: true, result: 'notEnough', diamonds: 0, price: 1 }));
    expect(await http.sendHeart()).toEqual({ result: 'notEnough', diamonds: 0, price: 1 });
  });

  it('throws room-feed’s message when it fails, or the answer has no result', async () => {
    await expect(
      setup(() => json({ error: '页面上没找到小心心' }, 500)).http.sendHeart(),
    ).rejects.toThrow('页面上没找到小心心');
    await expect(setup(() => json({ ok: true })).http.sendHeart()).rejects.toThrow(
      'room-feed answered 200',
    );
  });
});

describe('RoomFeedHttp.balance', () => {
  it('gets the diamonds, null when the page does not show them', async () => {
    const { http, calls } = setup(() => json({ diamonds: 10 }));
    expect(await http.balance()).toBe(10);
    expect(calls[0]?.url).toBe('http://localhost:8757/api/rooms/123/balance');
    expect(await setup(() => json({ diamonds: null })).http.balance()).toBeNull();
    await expect(setup(() => json({ error: '还没开播' }, 409)).http.balance()).rejects.toThrow(
      '还没开播',
    );
  });
});

describe('RoomFeedHttp.streamUrl', () => {
  it('returns the URL, or null when there is none or room-feed says not yet', async () => {
    expect(await setup(() => json({ url: 'https://pull/x.flv' })).http.streamUrl()).toBe(
      'https://pull/x.flv',
    );
    expect(await setup(() => json({})).http.streamUrl()).toBeNull();
    expect(await setup(() => json({ error: '还没开始' }, 409)).http.streamUrl()).toBeNull();
  });
});

describe('RoomFeedHttp.roomInfo', () => {
  it('returns the room, or null when room-feed does not answer ok', async () => {
    const room = { roomId: '123', status: 'live', meta: null, login: null };
    const { http, calls } = setup(() => json({ room }));
    expect(await http.roomInfo()).toEqual(room);
    expect(calls[0]?.url).toBe('http://localhost:8757/api/rooms/123');
    expect(await setup(() => json({ error: 'x' }, 404)).http.roomInfo()).toBeNull();
  });
});

describe('RoomFeedHttp.screenshot', () => {
  it('returns the JPEG bytes', async () => {
    const { http, calls } = setup(() => new Response(new Uint8Array([0xff, 0xd8, 0xff])));
    expect(await http.screenshot()).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(calls[0]?.url).toBe('http://localhost:8757/api/rooms/123/screenshot');
  });

  it('throws room-feed’s message, or its status when the body is not JSON', async () => {
    await expect(setup(() => json({ error: '没开播' }, 409)).http.screenshot()).rejects.toThrow(
      '没开播',
    );
    await expect(setup(() => new Response('x', { status: 500 })).http.screenshot()).rejects.toThrow(
      'room-feed answered 500',
    );
  });
});
