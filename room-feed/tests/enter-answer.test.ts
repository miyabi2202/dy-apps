import { isEnterOf, readEnterAnswer, STREAM_URL } from '../src/douyin/enter-answer';

const room = (extra: object) => ({ data: { data: [{ id_str: '700', status: 2, ...extra }] } });

describe('readEnterAnswer', () => {
  it('is null when there is no room in the answer', () => {
    expect(readEnterAnswer({})).toBeNull();
    expect(readEnterAnswer({ data: { data: [] } })).toBeNull();
  });

  it('reads the inner room id and whether the stream has ended (status 4)', () => {
    expect(readEnterAnswer(room({}))).toEqual({ innerRoomId: '700', ended: false, flvUrl: null });
    expect(readEnterAnswer(room({ status: 4 }))?.ended).toBe(true);
    expect(readEnterAnswer({ data: { data: [{}] } })?.innerRoomId).toBe('');
  });

  it('picks the lowest quality of the FLV URLs, else any', () => {
    const urls = (flv_pull_url: Record<string, string>) =>
      readEnterAnswer(room({ stream_url: { flv_pull_url } }))?.flvUrl;
    expect(urls({ FULL_HD1: 'hd', SD2: 'sd2', HD1: 'h' })).toBe('sd2');
    expect(urls({ FULL_HD1: 'full', HD1: 'h' })).toBe('h');
    expect(urls({ ORIGIN: 'origin' })).toBe('origin');
    expect(urls({})).toBeNull();
  });
});

describe('isEnterOf', () => {
  const enter = 'https://live.douyin.com/webcast/room/web/enter/?aid=6383&web_rid=123';

  it('is true for the enter request of that room only', () => {
    expect(isEnterOf(enter, '123')).toBe(true);
    expect(isEnterOf(enter, '456')).toBe(false);
    expect(isEnterOf('https://live.douyin.com/other/?web_rid=123', '123')).toBe(false);
  });
});

describe('STREAM_URL', () => {
  it('matches FLV and HLS requests, with or without a query', () => {
    expect(STREAM_URL.test('https://pull.example/live/stream.flv?sign=1')).toBe(true);
    expect(STREAM_URL.test('http://pull.example/live/stream.m3u8')).toBe(true);
    expect(STREAM_URL.test('https://pull.example/live/stream.flvx')).toBe(false);
    expect(STREAM_URL.test('https://pull.example/live/stream.mp4')).toBe(false);
  });
});
