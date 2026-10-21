/**
 * Douyin's live-room protobuf, decoded from the WebSocket frames the room page receives.
 *
 * A frame is PushFrame(payloadType msg) → gzip(payload) → Response → Message[], and each
 * Message's payload is one of the bodies below, picked by its `method`. The field numbers come
 * from watching webcast push frames (the same as dycast and DouyinBarrageGrab); rich text and
 * member emotes follow Douyin's web live-schema and TikTok's client decoder.
 */

import protobuf from 'protobufjs';
import { ungzip } from 'pako';

const DOUYIN_PROTO = `
syntax = "proto3";
message PushFrame {
  uint64 seqId = 1;
  uint64 logId = 2;
  uint64 service = 3;
  uint64 method = 4;
  repeated HeadersList headersList = 5;
  string payloadEncoding = 6;
  string payloadType = 7;
  bytes payload = 8;
}
message HeadersList { string key = 1; string value = 2; }

message Response {
  repeated Message messagesList = 1;
  string cursor = 2;
  uint64 fetchInterval = 3;
  uint64 now = 4;
  string internalExt = 5;
  uint32 fetchType = 6;
  uint64 heartbeatDuration = 8;
  bool needAck = 9;
  string pushServer = 10;
  string liveCursor = 11;
}

message Message {
  string method = 1;
  bytes payload = 2;
  int64 msgId = 3;
  int32 msgType = 4;
}

// ---- Message bodies: only what we read; undeclared fields are skipped ----
// Field names are camelCase because protobufjs turns names into camelCase when decoding.
message ChatMessage {
  Common common = 1;
  User user = 2;
  string content = 3;
  // Rich text: text, @user and emote images (fan-club and member emotes), piece by piece.
  // rtf_content = 40 and rtf_content_v2 = 41 as in Douyin's web live-schema; the old 22 is gone.
  Text rtfContent = 40;
  Text rtfContentV2 = 41;
}
// A member emote or big sticker: the whole message is one image, the first piece of emojiContent.
message EmojiChatMessage {
  Common common = 1;
  User user = 2;
  int64 emojiId = 3;
  Text emojiContent = 4;
  string defaultContent = 5;
}
// Rich text (webcast.data.Text), field numbers from putao520/douyin-proto-builder's live.data.proto.
message Text {
  string key = 1;
  string defaultPattern = 2;
  repeated TextPiece pieces = 4;
}
message TextPiece {
  int32 type = 1;
  string stringValue = 11;
  TextPieceUser userValue = 21;
  TextPieceImage imageValue = 25;
}
message TextPieceUser {
  User user = 1;
}
message TextPieceImage {
  Image image = 1;
}
message GiftMessage {
  Common common = 1;
  int64 giftId = 2;
  int64 groupCount = 4;
  int64 repeatCount = 5;
  int64 comboCount = 6;
  User user = 7;
  int32 repeatEnd = 9;
  int64 groupId = 11;
  GiftStruct gift = 15;
  string logId = 16;
  int64 sendType = 17;
  int64 sendTime = 33;
  string traceId = 35;
}
message GiftStruct {
  Image image = 1;
  string describe = 2;
  int64 id = 5;
  bool combo = 10;
  int32 type = 11;
  int32 diamondCount = 12;
  string name = 16;
  Image icon = 21;
}
message LikeMessage {
  Common common = 1;
  uint64 count = 2;
  uint64 total = 3;
  User user = 5;
}
message Common {
  string method = 1;
  uint64 msgId = 2;
  uint64 roomId = 3;
  uint64 createTime = 4;
}
message User {
  uint64 id = 1;
  uint64 shortId = 2;
  string nickName = 3;
  uint32 gender = 4;
  string signature = 5;
  uint32 level = 6;
  uint64 birthday = 7;
  string telephone = 8;
  Image avatarThumb = 9;
  Image avatarMedium = 10;
  Image avatarLarge = 11;
  // The badges by the name. 21 is the old list; 61 the new one, and only 61 has the
  // 直播间会员 badge (V / V年, imageType 59).
  repeated Image badgeImageList = 21;
  PayGrade payGrade = 23;
  FansClub fansClub = 24;
  repeated Image newBadgeImageList = 61;
  string secUid = 46;
  string idStr = 1029;
}
message Image {
  repeated string urlList = 1;
  string uri = 2;
  int64 height = 3;
  int64 width = 4;
  // Badge type: 1 honour level, 7 fan-club level, 51 fan-club upgrade, 59 直播间会员, …
  int32 imageType = 6;
  ImageContent content = 8;
  bool isAnimated = 9;
}
message ImageContent {
  string name = 1;
  string alternativeText = 4;
}
// Wealth level, as DouyinBarrageGrab's User.PayGrade.
message PayGrade {
  int64 level = 6;
}
// The fan club shown (usually this room's streamer's), as DouyinBarrageGrab's User.FansClub.
message FansClub {
  FansClubData data = 1;
}
message FansClubData {
  string clubName = 1;
  int32 level = 2;
  int32 userFansClubStatus = 3;
  int64 anchorId = 6;
}
`;

let parsed: protobuf.Root | null = null;

function lookup(name: string): protobuf.Type {
  parsed ??= protobuf.parse(DOUYIN_PROTO).root;
  return parsed.lookupType(name);
}

/** One message out of a frame, its body still encoded. */
export interface RawProtoMessage {
  method: string;
  msgId: string;
  payload: Uint8Array;
}

/** A decoded body; what's in it depends on `method`. */
export interface DecodedMessage {
  method: string;
  msgId: string;
  body: any;
}

const MESSAGE_TYPES: Record<string, string> = {
  WebcastChatMessage: 'ChatMessage',
  WebcastEmojiChatMessage: 'EmojiChatMessage',
  WebcastGiftMessage: 'GiftMessage',
  WebcastLikeMessage: 'LikeMessage',
};

/**
 * One WebSocket frame: whether it's a push (chat and gifts come in those) and its messages.
 * Throws on bytes that aren't a PushFrame, such as frames from the page's other sockets.
 */
export function decodeFrame(buf: Uint8Array): { push: boolean; messages: RawProtoMessage[] } {
  const frame = lookup('PushFrame').decode(buf) as any;
  const headers: Record<string, string> = {};
  for (const h of frame.headersList ?? []) {
    if (h.key) headers[h.key] = String(h.value ?? '');
  }
  const type = String(frame.payloadType ?? '');
  const push = type === 'msg' || type === 'push';

  let payload: Uint8Array = frame.payload ?? new Uint8Array(0);
  if (headers['compress_type'] === 'gzip') {
    try {
      payload = new Uint8Array(ungzip(payload));
    } catch {
      return { push, messages: [] };
    }
  }

  const messages: RawProtoMessage[] = [];
  if (push) {
    try {
      const resp = lookup('Response').decode(payload) as any;
      for (const m of resp.messagesList ?? []) {
        if (!m.method) continue;
        messages.push({
          method: String(m.method),
          msgId: String(m.msgId ?? ''),
          payload: m.payload ?? new Uint8Array(0),
        });
      }
    } catch {
      // Some frames (acks) have no Response in them.
    }
  }
  return { push, messages };
}

/** The message's body, or null for a method we don't read or a body that doesn't decode. */
export function decodeMessageBody(msg: RawProtoMessage): DecodedMessage | null {
  const typeName = MESSAGE_TYPES[msg.method];
  if (!typeName) return null;
  try {
    return { method: msg.method, msgId: msg.msgId, body: lookup(typeName).decode(msg.payload) };
  } catch {
    return null;
  }
}

/** A Long (or number, bigint) as a decimal string, so 64-bit ids keep every digit. */
export function longToStr(v: any): string {
  if (v == null) return '';
  if (typeof v === 'bigint' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && typeof v.toString === 'function') return String(v.toString());
  return String(v);
}
