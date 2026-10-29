import { RoomFeedHttp } from '@dy-apps/room-feed-protocol';
import type {
  FindStreamer,
  PressLike,
  Screenshot,
  SendChat,
  SendFansLamp,
  StreamUrl,
} from '../../app/ports';

/**
 * One live room's HTTP API on room-feed (see RoomFeedHttp), as the bot's ports: send chat, like,
 * get the stream URL and a screenshot of the player (once the room is live), and who the
 * streamer is.
 */
export class RoomFeedApi {
  private readonly http: RoomFeedHttp;

  constructor(port: number, roomId: string, fetchFn: typeof fetch = fetch) {
    this.http = new RoomFeedHttp({ port, roomId, fetch: fetchFn });
  }

  readonly sendChat: SendChat = (text) => this.http.sendChat(text);

  readonly like: PressLike = (likes) => this.http.like(likes);

  readonly sendFansLamp: SendFansLamp = () => this.http.sendFansLamp();

  readonly streamUrl: StreamUrl = () => this.http.streamUrl();

  /** The streamer, from the room page, once room-feed has read it. */
  readonly streamer: FindStreamer = async () => {
    const info = await this.http.roomInfo();
    const { uid, nickname = '' } = info?.meta ?? {};
    return uid ? { uid, nickname } : null;
  };

  readonly screenshot: Screenshot = () => this.http.screenshot();
}
