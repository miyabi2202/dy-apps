/**
 * What room-feed sends its clients: one JSON object (a Frame) per WebSocket message. Room events
 * (chat, gift, like) come as they happen; status frames (`__hello`, `__connecting`, `__connected`,
 * `__error`) say where the room's connection is.
 */

export type EventType = 'chat' | 'gift' | 'like';

export const EVENT_TYPES: readonly EventType[] = ['chat', 'gift', 'like'];

export interface EventUser {
  /** The Douyin uid, as a string so it keeps every digit. */
  id: string;
  nickname: string;
  avatar?: string;
  /** Wealth level (财富等级); missing when the message doesn't carry it. */
  payLevel?: number;
  /** The fan club shown by the name, usually this room's streamer's; missing when not a member. */
  fansClub?: { name: string; level: number; status?: number; anchorId?: string };
  /** The badges by the name: 直播间会员 as `V` or `V年`, the rest by their text; missing when none. */
  badges?: string[];
}

interface BaseEvent {
  /** Douyin's message id, for dropping repeats. */
  id: string;
  /** The room number (the digits in live.douyin.com/<id>), not Douyin's internal room id. */
  roomId: string;
  /** When it happened, in ms. */
  ts: number;
  user?: EventUser;
}

/** A piece of a chat's rich text: text, an emote image (fan-club and member emotes) or an @. */
export type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'emote'; url: string; name?: string; width?: number; height?: number }
  | { type: 'mention'; text: string; userId?: string };

export interface ChatEvent extends BaseEvent {
  type: 'chat';
  data: {
    /** The text, with emotes as placeholders like [比心]; may be empty for an emote-only chat. */
    content: string;
    /** The rich text, when Douyin sends it; shown in preference to `content`. */
    parts?: ChatPart[];
    /** The whole chat is one member emote or big sticker. */
    sticker?: boolean;
  };
}

export interface GiftEvent extends BaseEvent {
  type: 'gift';
  data: {
    giftId: string;
    giftName: string;
    giftIcon?: string;
    /** What one is worth, in diamonds. */
    diamondCount?: number;
    /** How many so far in this combo. */
    repeatCount?: number;
    /** The closing message of a combo, repeating its total. */
    repeatEnd?: boolean;
    /** Shared by every message of one send or combo, so they can be counted once. */
    groupId?: string;
  };
}

export interface LikeEvent extends BaseEvent {
  type: 'like';
  data: { count?: number; total?: number };
}

export type RoomEvent = ChatEvent | GiftEvent | LikeEvent;

export type StatusFrame =
  | { type: '__hello'; roomId: string; types: EventType[]; ts: number }
  | { type: '__connecting'; roomId: string; ts: number }
  | { type: '__connected'; roomId: string; ts: number }
  | { type: '__error'; roomId: string; error: string; ts: number }
  /**
   * Sent just before room-feed exits for good: the stream has ended (or hadn't started), or the
   * page showed another room. `detail` says which, in words for the log.
   */
  | { type: '__ended'; roomId: string; reason: RoomGoneReason; detail: string; ts: number };

/** Why room-feed stopped for good. */
export type RoomGoneReason = 'ended' | 'wrongRoom';

/** One WebSocket message from room-feed. */
export type Frame = RoomEvent | StatusFrame;
