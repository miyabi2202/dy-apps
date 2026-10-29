import protobuf from 'protobufjs';
import { PushTracker } from '../src/push-tracker';

// The same field numbers as src/douyin/proto.ts, only what a frame needs.
const root = protobuf.parse(
  `syntax = "proto3";
   message PushFrame { string payloadType = 7; bytes payload = 8; }
   message Response { repeated Message messagesList = 1; }
   message Message { string method = 1; bytes payload = 2; int64 msgId = 3; }
   message Envelope { Common common = 1; }
   message Common { uint64 roomId = 3; }`,
).root;

/** A frame as CDP gives it: base64 of a PushFrame holding messages for these rooms. */
function frame(type: string, roomIds: string[]): string {
  const messagesList = roomIds.map((roomId, i) => ({
    method: 'WebcastLikeMessage',
    msgId: i + 1,
    payload: root.lookupType('Envelope').encode({ common: { roomId } }).finish(),
  }));
  const payload = root.lookupType('Response').encode({ messagesList }).finish();
  const bytes = root.lookupType('PushFrame').encode({ payloadType: type, payload }).finish();
  return Buffer.from(bytes).toString('base64');
}

describe('PushTracker.frame', () => {
  it('passes on a push frame’s messages', () => {
    const tracker = new PushTracker(() => '700');
    const decision = tracker.frame('ws1', frame('msg', ['700', '700']));
    expect(decision.kind).toBe('push');
    if (decision.kind === 'push') expect(decision.messages.map((m) => m.msgId)).toEqual(['1', '2']);
  });

  it('ignores an empty payload, bytes that are not a frame, and frames that are not pushes', () => {
    const tracker = new PushTracker(() => '700');
    expect(tracker.frame('ws1', undefined)).toEqual({ kind: 'ignore' });
    expect(tracker.frame('ws1', '')).toEqual({ kind: 'ignore' });
    expect(tracker.frame('ws1', Buffer.from('not protobuf at all').toString('base64'))).toEqual({
      kind: 'ignore',
    });
    expect(tracker.frame('ws1', frame('ack', ['700']))).toEqual({ kind: 'ignore' });
  });

  it('calls a message for another room the wrong room, naming both', () => {
    const tracker = new PushTracker(() => '700');
    const decision = tracker.frame('ws1', frame('msg', ['700', '999']));
    expect(decision).toEqual({
      kind: 'wrongRoom',
      why: '收到了别的直播间（999）的弹幕，不是本直播间的（700）',
    });
  });

  it('passes everything on until the room id is known', () => {
    const room: { id?: string } = {};
    const tracker = new PushTracker(() => room.id);
    expect(tracker.frame('ws1', frame('msg', ['999'])).kind).toBe('push');
    room.id = '700';
    expect(tracker.frame('ws1', frame('msg', ['999'])).kind).toBe('wrongRoom');
  });

  it('takes a message that carries no room as this room’s', () => {
    const tracker = new PushTracker(() => '700');
    expect(tracker.frame('ws1', frame('msg', ['0'])).kind).toBe('push');
  });
});

describe('PushTracker.closed', () => {
  it('is true only when the last push socket closes', () => {
    const tracker = new PushTracker(() => '700');
    tracker.frame('ws1', frame('msg', ['700']));
    tracker.frame('ws2', frame('msg', ['700']));
    expect(tracker.closed('ws1')).toBe(false);
    expect(tracker.closed('ws2')).toBe(true);
  });

  it('ignores sockets that never sent a push frame', () => {
    const tracker = new PushTracker(() => '700');
    tracker.frame('ws1', frame('msg', ['700']));
    tracker.frame('other', frame('ack', ['700']));
    expect(tracker.closed('other')).toBe(false);
    expect(tracker.closed('ws1')).toBe(true);
  });

  it('is false for a socket closing twice', () => {
    const tracker = new PushTracker(() => '700');
    tracker.frame('ws1', frame('msg', ['700']));
    expect(tracker.closed('ws1')).toBe(true);
    expect(tracker.closed('ws1')).toBe(false);
  });
});
