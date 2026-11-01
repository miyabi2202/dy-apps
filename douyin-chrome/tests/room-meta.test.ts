import { parseRoomMeta } from '../src/room-meta';

describe('parseRoomMeta', () => {
  it('finds the streamer, uid and sec_uid in the escaped page data', () => {
    const html =
      '&quot;nickname&quot;:&quot;主播小A&quot;,&quot;title&quot;:&quot;唱歌&quot;' +
      '"anchor":{\\"id_str\\":\\"123456\\",\\"sec_uid\\":\\"MS4wLjABAAAAstreamer\\"}';
    expect(parseRoomMeta(html)).toMatchObject({
      nickname: '主播小A',
      uid: '123456',
      secUid: 'MS4wLjABAAAAstreamer',
    });
    expect(parseRoomMeta('<html></html>')).toBeNull();
  });
});
