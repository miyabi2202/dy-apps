import { decodeFrame, messageRoomId, type RawProtoMessage } from './douyin/proto';

/** What to do with one WebSocket frame the page received. */
export type PushDecision =
  /** Not a push frame (another socket's, or not Douyin's at all): nothing to do. */
  | { kind: 'ignore' }
  /** Push frame with these messages (maybe none), all for this room. */
  | { kind: 'push'; messages: RawProtoMessage[] }
  /** A message for another room: the page has moved on, so nothing from it can be used. */
  | { kind: 'wrongRoom'; why: string };

/**
 * Decides what the room page's WebSocket frames mean: which are Douyin's push frames, which
 * sockets sent them, whether they're for this room, and when the chat connection is down.
 */
export class PushTracker {
  /** WebSockets (CDP request ids) that have sent push frames: chat is down only when all close. */
  private readonly pushSockets = new Set<string>();

  /**
   * `expectedRoomId` is the internal room id the page's push messages should carry; it's read at
   * each frame, as it's known only once the enter answer is in. `decode` is decodeFrame unless a
   * test swaps it.
   */
  constructor(
    private readonly expectedRoomId: () => string | undefined,
    private readonly decode: typeof decodeFrame = decodeFrame,
  ) {}

  /**
   * A frame from socket `requestId`, its payload base64 as CDP gives it. CDP frames don't say
   * which socket's URL they came from, so every frame is tried; those that aren't Douyin's push
   * frames fail to decode and are ignored.
   */
  frame(requestId: string, payloadData: string | undefined): PushDecision {
    if (!payloadData) return { kind: 'ignore' };
    let frame;
    try {
      frame = this.decode(Buffer.from(payloadData, 'base64'));
    } catch {
      return { kind: 'ignore' };
    }
    if (!frame.push) return { kind: 'ignore' };
    this.pushSockets.add(requestId);
    // Until the enter answer is in, there's nothing to check against.
    const expected = this.expectedRoomId();
    const other = expected && frame.messages.map(messageRoomId).find((id) => id && id !== expected);
    if (other) {
      return {
        kind: 'wrongRoom',
        why: `收到了别的直播间（${other}）的弹幕，不是本直播间的（${expected}）`,
      };
    }
    return { kind: 'push', messages: frame.messages };
  }

  /**
   * Socket `requestId` closed. True when that was the last push socket: the page's other
   * sockets don't matter, chat is down when every push socket has closed.
   */
  closed(requestId: string): boolean {
    return this.pushSockets.delete(requestId) && this.pushSockets.size === 0;
  }
}
