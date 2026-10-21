import type { RoomFeedClient, RoomFeedSocket } from '@dy-apps/room-feed-protocol';
import type { LiveRoom } from '@dy-apps/services';
import { act, renderHook } from '@testing-library/react';
import { createRoomFeedClient, useRoomFeed } from '../use-room-feed';

/** The hook's real RoomFeedClients on fake sockets, so the test can send room-feed frames. */
function fakeClients() {
  const sockets: (RoomFeedSocket & { url: string; closed: boolean })[] = [];
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
    } as RoomFeedSocket & { url: string; closed: boolean };
    sockets.push(socket);
    return socket;
  };
  const create = jest.fn((r: LiveRoom) => createRoomFeedClient(r, openSocket));
  const send = (frame: object) =>
    act(() => sockets.at(-1)!.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent<string>));
  return { create, sockets, send };
}

const room: LiveRoom = { port: 8757, roomId: '123' };

function setup(initialRoom: LiveRoom | null = room) {
  const fake = fakeClients();
  const subscribe = jest.fn((client: RoomFeedClient) => {
    client.onComment(() => {});
  });
  const hook = renderHook(({ r }) => useRoomFeed(r, subscribe, { create: fake.create }), {
    initialProps: { r: initialRoom },
  });
  return { ...fake, hook };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useRoomFeed', () => {
  it('stays idle without a room', () => {
    const { create, hook } = setup(null);
    expect(create).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('idle');
  });

  it('connects to the room and reports its status', () => {
    const { sockets, send, hook } = setup();
    expect(sockets[0]!.url).toBe('ws://localhost:8757/ws?roomId=123&types=chat');
    send({ type: '__connected' });
    expect(hook.result.current.status).toBe('ready');
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
