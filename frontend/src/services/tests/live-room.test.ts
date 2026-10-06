import { createConnectionStore, liveRoomFrom, readLiveRoom, setLiveRoomParams } from '..';

describe('liveRoomFrom', () => {
  it('accepts a port and a room number, trimmed', () => {
    expect(liveRoomFrom({ port: ' 8757 ', roomId: ' 484088206186 ' })).toEqual({
      port: 8757,
      roomId: '484088206186',
    });
  });

  it('rejects a bad port or room number', () => {
    expect(liveRoomFrom({ port: '', roomId: '1' })).toBeNull();
    expect(liveRoomFrom({ port: '70000', roomId: '1' })).toBeNull();
    expect(liveRoomFrom({ port: '8757', roomId: '' })).toBeNull();
    expect(liveRoomFrom({ port: '8757', roomId: 'live.douyin.com/1' })).toBeNull();
  });
});

describe('live room URL parameters', () => {
  it('round-trips through the query string', () => {
    const params = new URLSearchParams({ obs: '1' });
    setLiveRoomParams(params, { port: 8757, roomId: '123' });
    expect(params.toString()).toBe('obs=1&port=8757&room=123');
    expect(readLiveRoom(`?${params.toString()}`)).toEqual({ port: 8757, roomId: '123' });
  });

  it('is null when either is missing or invalid', () => {
    expect(readLiveRoom('')).toBeNull();
    expect(readLiveRoom('?port=8757')).toBeNull();
    expect(readLiveRoom('?port=abc&room=123')).toBeNull();
  });
});

describe('createConnectionStore', () => {
  const connectionStore = createConnectionStore('danmaku');

  beforeEach(() => localStorage.clear());

  it('keeps what was typed, valid or not', () => {
    connectionStore.write({ port: '87', roomId: 'abc' });
    expect(connectionStore.read()).toEqual({ port: '87', roomId: 'abc' });
  });

  it("is stored under the app's name", () => {
    expect(connectionStore.key).toBe('dy-apps:danmaku.connection');
  });

  it('falls back to empty fields for a hand-edited value', () => {
    localStorage.setItem(connectionStore.key, JSON.stringify({ port: 8757 }));
    expect(connectionStore.read()).toEqual({ port: '', roomId: '' });
  });
});
