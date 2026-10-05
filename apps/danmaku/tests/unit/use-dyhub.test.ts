import type { DyhubEvent, DyhubHandlers, LiveRoom } from '@dy-apps/services';
import { act, renderHook } from '@testing-library/react';
import type { DanmakuMessage } from '../../src/types';
import { useDyhub } from '../../src/use-dyhub';

/** A fake connectDyhub that records each connection so the test can drive it. */
function fakeConnect() {
  const connections: {
    port: number;
    roomId: string;
    handlers: DyhubHandlers;
    types?: readonly string[];
    closed: boolean;
  }[] = [];
  const connect = jest.fn(
    (port: number, roomId: string, handlers: DyhubHandlers, types?: readonly string[]) => {
      const c = { port, roomId, handlers, types, closed: false };
      connections.push(c);
      return () => {
        c.closed = true;
      };
    },
  );
  return { connect, connections, last: () => connections.at(-1)! };
}

const room: LiveRoom = { port: 8757, roomId: '123' };

const gift = (repeatCount: number, extra: Record<string, unknown> = {}): DyhubEvent => ({
  id: `m${repeatCount}`,
  roomId: '123',
  type: 'gift',
  ts: 0,
  user: { id: 'u1', nickname: '奶茶不加糖' },
  data: { giftId: 'g1', giftName: '玫瑰', groupId: 'grp', repeatCount, ...extra },
});

const like = (id: string, userId: string, count: number): DyhubEvent => ({
  id,
  roomId: '123',
  type: 'like',
  ts: 0,
  user: { id: userId, nickname: userId },
  data: { count },
});

function setup(initialRoom: LiveRoom | null = room) {
  const fake = fakeConnect();
  const pushed: DanmakuMessage[] = [];
  const push = (m: DanmakuMessage) => pushed.push(m);
  const hook = renderHook(({ r }) => useDyhub(r, push, fake.connect), {
    initialProps: { r: initialRoom },
  });
  return { ...fake, pushed, hook };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useDyhub', () => {
  it('stays idle without a room', () => {
    const { connect, hook } = setup(null);
    expect(connect).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('idle');
  });

  it('connects to the room and reports its status', () => {
    const { last, hook } = setup();
    expect(last()).toMatchObject({ port: 8757, roomId: '123' });
    act(() => last().handlers.onStatus('ready'));
    expect(hook.result.current.status).toBe('ready');
  });

  it('pushes chats, and each gift combo only by what it adds', () => {
    const { last, pushed } = setup();
    act(() => {
      const onEvent = (ev: DyhubEvent) => last().handlers.onEvent(ev);
      onEvent({ ...gift(0), id: 'c1', type: 'chat', data: { content: '来了' } });
      onEvent(gift(1));
      onEvent(gift(5));
      onEvent(gift(5)); // a repeat of the same progress
      onEvent(gift(5, { repeatEnd: true })); // the closing copy
    });
    expect(pushed.map((m) => m.text || `×${m.gift!.count}`)).toEqual(['来了', '×1', '×4']);
    // Both gift pushes share the combo's id, so addMessage merges them into one card.
    expect(pushed[1]!.id).toBe(pushed[2]!.id);
  });

  it('subscribes to chats, gifts and likes', () => {
    const { last } = setup();
    expect(last().types).toEqual(['chat', 'gift', 'like']);
  });

  it("pushes one card per user once they've stopped liking for 5 seconds", () => {
    const { last, pushed } = setup();
    const onEvent = (ev: DyhubEvent) => last().handlers.onEvent(ev);
    act(() => {
      onEvent(like('l1', 'a', 3));
      onEvent(like('l2', 'b', 1));
    });
    act(() => jest.advanceTimersByTime(4000));
    act(() => onEvent(like('l3', 'a', 4))); // restarts a's 5 seconds
    act(() => jest.advanceTimersByTime(1000));
    expect(pushed.map((m) => [m.user.id, m.likes])).toEqual([['b', 1]]);

    act(() => jest.advanceTimersByTime(4000));
    expect(pushed.map((m) => [m.user.id, m.likes])).toEqual([
      ['b', 1],
      ['a', 7],
    ]);
  });

  it('drops likes not yet shown when the room is cleared', () => {
    const { last, pushed, hook } = setup();
    act(() => last().handlers.onEvent(like('l1', 'a', 3)));
    hook.rerender({ r: null });
    act(() => jest.advanceTimersByTime(60_000));
    expect(pushed).toEqual([]);
  });

  it('retries a few seconds after an error, closing the old connection', () => {
    const { connections, last, hook } = setup();
    act(() => last().handlers.onStatus('error', '无法连接'));
    expect(hook.result.current).toEqual({ status: 'error', detail: '无法连接' });
    expect(connections).toHaveLength(1);

    act(() => jest.advanceTimersByTime(5000));
    expect(connections).toHaveLength(2);
    expect(connections[0]!.closed).toBe(true);
  });

  it('retries after the connection closes', () => {
    const { connections, last } = setup();
    act(() => last().handlers.onStatus('closed'));
    act(() => jest.advanceTimersByTime(5000));
    expect(connections).toHaveLength(2);
  });

  it('disconnects, stops retrying and goes idle when the room is cleared', () => {
    const { connections, last, hook } = setup();
    act(() => last().handlers.onStatus('error'));
    hook.rerender({ r: null });
    expect(connections[0]!.closed).toBe(true);
    expect(hook.result.current.status).toBe('idle');

    act(() => jest.advanceTimersByTime(60_000));
    expect(connections).toHaveLength(1);
  });

  it('reconnects when the room changes', () => {
    const { connections, hook } = setup();
    hook.rerender({ r: { port: 8757, roomId: '456' } });
    expect(connections[0]!.closed).toBe(true);
    expect(connections[1]).toMatchObject({ roomId: '456' });
  });
});
