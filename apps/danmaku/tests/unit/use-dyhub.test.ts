import type { DyhubSocket, LiveRoom } from '@dy-apps/services';
import { act, renderHook } from '@testing-library/react';
import type { DanmakuMessage } from '../../src/types';
import { createDyhubClient, useDyhub } from '../../src/use-dyhub';

/** The page's real DyhubClients on fake sockets, so the test can send DyHub frames. */
function fakeClients() {
  const sockets: (DyhubSocket & { url: string; closed: boolean })[] = [];
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
    sockets.push(socket);
    return socket;
  };
  const create = jest.fn((r: LiveRoom) => createDyhubClient(r, openSocket));
  const send = (frame: object) =>
    act(() => sockets.at(-1)!.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent<string>));
  return { create, sockets, send };
}

const room: LiveRoom = { port: 8757, roomId: '123' };

const gift = (repeatCount: number, extra: Record<string, unknown> = {}) => ({
  id: `m${repeatCount}`,
  roomId: '123',
  type: 'gift',
  ts: 0,
  user: { id: 'u1', nickname: '奶茶不加糖' },
  data: { giftId: 'g1', giftName: '玫瑰', groupId: 'grp', repeatCount, ...extra },
});

const like = (id: string, userId: string, count: number) => ({
  id,
  roomId: '123',
  type: 'like',
  ts: 0,
  user: { id: userId, nickname: userId },
  data: { count },
});

function setup(initialRoom: LiveRoom | null = room) {
  const fake = fakeClients();
  const pushed: DanmakuMessage[] = [];
  const push = (m: DanmakuMessage) => pushed.push(m);
  const hook = renderHook(({ r }) => useDyhub(r, push, fake.create), {
    initialProps: { r: initialRoom },
  });
  return { ...fake, pushed, hook };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useDyhub', () => {
  it('stays idle without a room', () => {
    const { create, hook } = setup(null);
    expect(create).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('idle');
  });

  it('connects to the room for chats, gifts and likes, and reports its status', () => {
    const { sockets, send, hook } = setup();
    expect(sockets[0]!.url).toBe('ws://localhost:8757/ws?roomId=123&types=chat,gift,like');
    send({ type: '__connected' });
    expect(hook.result.current.status).toBe('ready');
  });

  it('pushes chats, and each gift combo only by what it adds', () => {
    const { send, pushed } = setup();
    send({ ...gift(0), id: 'c1', type: 'chat', data: { content: '来了' } });
    send(gift(1));
    send(gift(5));
    send(gift(5)); // a repeat of the same progress
    send(gift(5, { repeatEnd: true })); // the closing copy
    expect(pushed.map((m) => m.text || `×${m.gift!.count}`)).toEqual(['来了', '×1', '×4']);
    // Both gift pushes share the combo's id, so addMessage merges them into one card.
    expect(pushed[1]!.id).toBe(pushed[2]!.id);
  });

  it("pushes one card per user once they've stopped liking for 5 seconds", () => {
    const { send, pushed } = setup();
    send(like('l1', 'a', 3));
    send(like('l2', 'b', 1));
    act(() => jest.advanceTimersByTime(4000));
    send(like('l3', 'a', 4)); // restarts a's 5 seconds
    act(() => jest.advanceTimersByTime(1000));
    expect(pushed.map((m) => [m.user.id, m.likes])).toEqual([['b', 1]]);

    act(() => jest.advanceTimersByTime(4000));
    expect(pushed.map((m) => [m.user.id, m.likes])).toEqual([
      ['b', 1],
      ['a', 7],
    ]);
  });

  it('drops likes not yet shown when the room is cleared', () => {
    const { send, pushed, hook } = setup();
    send(like('l1', 'a', 3));
    hook.rerender({ r: null });
    act(() => jest.advanceTimersByTime(60_000));
    expect(pushed).toEqual([]);
  });

  it('retries a few seconds after an error', () => {
    const { sockets, hook } = setup();
    act(() => sockets[0]!.onerror?.(new Event('error')));
    expect(hook.result.current.status).toBe('error');
    act(() => jest.advanceTimersByTime(5000));
    expect(sockets).toHaveLength(2);
  });

  it('disconnects, stops retrying and goes idle when the room is cleared', () => {
    const { sockets, hook } = setup();
    act(() => sockets[0]!.onerror?.(new Event('error')));
    hook.rerender({ r: null });
    expect(sockets[0]!.closed).toBe(true);
    expect(hook.result.current.status).toBe('idle');

    act(() => jest.advanceTimersByTime(60_000));
    expect(sockets).toHaveLength(1);
  });

  it('reconnects when the room changes', () => {
    const { sockets, hook } = setup();
    hook.rerender({ r: { port: 8757, roomId: '456' } });
    expect(sockets[0]!.closed).toBe(true);
    expect(sockets[1]!.url).toContain('roomId=456');
  });
});
