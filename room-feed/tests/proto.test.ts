import protobuf from 'protobufjs';
import { messageRoomId } from '../src/douyin/proto';

const likeType = protobuf
  .parse(
    `syntax = "proto3";
     message LikeMessage { Common common = 1; uint64 count = 2; }
     message Common { string method = 1; uint64 roomId = 3; }`,
  )
  .root.lookupType('LikeMessage');

describe('messageRoomId', () => {
  it('reads the room from any message, whatever its method', () => {
    const payload = likeType
      .encode({ common: { method: 'WebcastLikeMessage', roomId: '7699168659171756841' }, count: 3 })
      .finish();
    expect(messageRoomId({ method: 'WebcastLikeMessage', msgId: '1', payload })).toBe(
      '7699168659171756841',
    );
  });

  it('is empty when the message carries no room', () => {
    const payload = likeType.encode({ count: 3 }).finish();
    expect(messageRoomId({ method: 'WebcastSomethingNew', msgId: '1', payload })).toBe('');
  });
});
