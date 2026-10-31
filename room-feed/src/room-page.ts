import type { RawProtoMessage } from './douyin/proto';
import type {
  FansLampResult,
  HeartResult,
  LikeResult,
  RoomMeta,
} from '@dy-apps/room-feed-protocol';

/** What a room page tells the Room. */
export interface RoomPageHandlers {
  /** A push frame came in, with these messages (maybe none). */
  onPush(messages: RawProtoMessage[]): void;
  /** The chat connection or the page itself went away; called once, never after `close()`. */
  onClosed(why: string): void;
  /**
   * The page shows another room now (Douyin moved it to one it recommends): what comes in isn't
   * this room's, so room-feed should stop rather than reopen. Called once, instead of `onClosed`.
   */
  onWrongRoom(why: string): void;
}

/** The live room open in Chrome: Douyin's page does the signing, we only watch and type. */
export interface RoomPage {
  /** The streamer, from the page's HTML; null if it couldn't be read. */
  readonly meta: RoomMeta | null;
  /** The FLV or HLS URL the player pulls, or null before it has one. */
  streamUrl(): string | null;
  /** Types `text` into the chat box and presses Enter; throws when it doesn't go. */
  typeChat(text: string): Promise<void>;
  /** The player as a JPEG. */
  screenshot(): Promise<Uint8Array>;
  /**
   * Holds the like key on the player until about `likes` likes have gone, or Douyin says 手速太快了:
   * about how many went, and how long it held.
   */
  holdLike(likes: number): Promise<LikeResult>;
  /**
   * Sends today's 粉丝团灯牌 from the 粉丝团 panel, following the streamer first if need be:
   * `already` when today's was sent before, `notEnough` with too few diamonds. Throws when the
   * panel doesn't show either.
   */
  sendFansLamp(): Promise<FansLampResult>;
  /**
   * Sends the streamer one 小心心 (1 diamond) from the gift panel: `sent` with the diamonds left
   * (null when the balance doesn't show), or `notEnough`. Throws when it can't, or the balance
   * doesn't drop.
   */
  sendHeart(): Promise<HeartResult>;
  /** The account's diamonds, by the gift bar's 充值; null when they don't show. */
  balance(): Promise<number | null>;
  close(): Promise<void>;
}

export type OpenRoomPage = (roomId: string, handlers: RoomPageHandlers) => Promise<RoomPage>;
