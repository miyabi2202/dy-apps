import { DyhubClient, type DyhubSocket, type DyhubStatus } from '../src';

/** A fake openSocket: records each socket so the test can send it frames. */
function fakeSockets() {
  const opened: (DyhubSocket & { url: string; closed: boolean })[] = [];
  const openSocket = (url: string) => {
    const socket = {
      url,
      closed: false,
      onmessage: null,
      onerror: null,
      onclose: null,
      close() {
        socket.closed = true;
      },
    } as DyhubSocket & { url: string; closed: boolean };
    opened.push(socket);
    return socket;
  };
  const last = () => opened.at(-1)!;
  const send = (frame: object) =>
    last().onmessage?.({ data: JSON.stringify(frame) } as MessageEvent<string>);
  return { openSocket, opened, last, send };
}

/** A fake clock for retries. */
function fakeClock() {
  let timers: { run: () => void; ms: number }[] = [];
  return {
    schedule: (run: () => void, ms: number) => {
      const timer = { run, ms };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
    runAll() {
      const due = timers;
      timers = [];
      for (const t of due) t.run();
    },
    pending: () => timers.map((t) => t.ms),
  };
}

const user = { id: 'u1', nickname: '奶茶不加糖' };

function setup(retryMs?: number) {
  const sockets = fakeSockets();
  const clock = fakeClock();
  const client = new DyhubClient({
    port: 8757,
    roomId: '123',
    retryMs,
    openSocket: sockets.openSocket,
    schedule: clock.schedule,
  });
  const statuses: [DyhubStatus, string | undefined][] = [];
  client.onStatus((s, d) => statuses.push([s, d]));
  return { ...sockets, clock, client, statuses };
}

describe('DyhubClient', () => {
  it('subscribes only to the event types it has handlers for', () => {
    const { client, last } = setup();
    client.onGift(() => {});
    client.onLike(() => {});
    client.connect();
    expect(last().url).toBe('ws://localhost:8757/ws?roomId=123&types=gift,like');
  });

  it("reports DyHub's progress frames as statuses", () => {
    const { client, send, statuses } = setup();
    client.connect();
    send({ type: '__hello' });
    send({ type: '__connecting' });
    send({ type: '__connected' });
    send({ type: '__error', error: '房间未开播' });
    expect(statuses).toEqual([
      ['opening', undefined],
      ['roomConnecting', undefined],
      ['ready', undefined],
      ['error', '房间未开播'],
    ]);
  });

  it('passes comments with text, and skips malformed ones', () => {
    const { client, send } = setup();
    const comments: string[] = [];
    client.onComment((ev) => comments.push(ev.data.content));
    client.connect();
    send({ id: 'c1', roomId: '123', type: 'chat', ts: 1, user, data: { content: '来了' } });
    send({ id: 'c2', roomId: '123', type: 'chat', ts: 2, user, data: { content: 7 } });
    send({ id: 'c3', roomId: '123', type: 'chat', ts: 3, user });
    expect(comments).toEqual(['来了']);
  });

  it('passes each gift message with how many new gifts it adds', () => {
    const { client, send } = setup();
    const gifts: number[] = [];
    client.onGift((_, newGifts) => gifts.push(newGifts));
    client.connect();
    const gift = (repeatCount: number, extra = {}) => ({
      id: `g${repeatCount}`,
      roomId: '123',
      type: 'gift',
      ts: 0,
      user,
      data: { giftId: 'g1', groupId: 'grp', repeatCount, ...extra },
    });
    send(gift(1));
    send(gift(5));
    send(gift(5)); // a repeat of the same progress
    send(gift(5, { repeatEnd: true }));
    send({ ...gift(1), data: {} }); // no giftId: not a gift DyHub could have sent
    expect(gifts).toEqual([1, 4, 0, 0]);
  });

  it('passes each like with its tap count', () => {
    const { client, send } = setup();
    const likes: number[] = [];
    client.onLike((_, count) => likes.push(count));
    client.connect();
    send({ id: 'l1', roomId: '123', type: 'like', ts: 0, user, data: { count: 5 } });
    send({ id: 'l2', roomId: '123', type: 'like', ts: 0, user });
    expect(likes).toEqual([5, 1]);
  });

  it('stops calling a handler once it is removed', () => {
    const { client, send } = setup();
    const comments: string[] = [];
    const off = client.onComment((ev) => comments.push(ev.data.content));
    client.connect();
    off();
    send({ id: 'c1', roomId: '123', type: 'chat', ts: 1, user, data: { content: '来了' } });
    expect(comments).toEqual([]);
  });

  it('reports a socket error with a hint to start DyHub', () => {
    const { client, last, statuses } = setup();
    client.connect();
    last().onerror?.(new Event('error'));
    last().onclose?.({} as CloseEvent);
    expect(statuses.slice(1)).toEqual([['error', '无法连接 localhost:8757，请确认 DyHub 已启动']]);
  });

  it('reconnects after an error or a drop when it has retryMs, closing the old socket', () => {
    const { client, opened, last, clock } = setup(5000);
    client.connect();
    last().onerror?.(new Event('error'));
    expect(clock.pending()).toEqual([5000]);
    clock.runAll();
    expect(opened).toHaveLength(2);
    expect(opened[0]!.closed).toBe(true);

    last().onclose?.({} as CloseEvent);
    clock.runAll();
    expect(opened).toHaveLength(3);
  });

  it('stays down without retryMs', () => {
    const { client, last, clock } = setup();
    client.connect();
    last().onerror?.(new Event('error'));
    expect(clock.pending()).toEqual([]);
  });

  it('closes the socket and stops retrying on close()', () => {
    const { client, opened, last, clock } = setup(5000);
    client.connect();
    last().onclose?.({} as CloseEvent);
    client.close();
    expect(opened[0]!.closed).toBe(true);
    expect(clock.pending()).toEqual([]);
  });
});
