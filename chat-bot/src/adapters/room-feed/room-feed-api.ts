import {
  roomUrl,
  type ChatAnswer,
  type ChatRequest,
  type ErrorAnswer,
  type FansLampAnswer,
  type LikeAnswer,
  type LikeRequest,
  type RoomInfoAnswer,
  type StreamAnswer,
} from '@dy-apps/room-feed-protocol';
import type {
  FindStreamer,
  PressLike,
  Screenshot,
  SendChat,
  SendFansLamp,
  StreamUrl,
} from '../../app/ports';

/**
 * One live room's HTTP API on room-feed: send chat, like, get the stream URL and a screenshot of
 * the player (once the room is live), and who the streamer is.
 */
export class RoomFeedApi {
  constructor(
    private readonly port: number,
    private readonly roomId: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** `POST …/chat`. */
  readonly sendChat: SendChat = async (text) => {
    const request: ChatRequest = { text };
    const res = await this.fetchFn(roomUrl(this.port, this.roomId, 'chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<ChatAnswer & ErrorAnswer>;
    if (!res.ok) throw new Error(body.error ?? `room-feed answered ${res.status}`);
    return { echoed: body.echoed === true };
  };

  /** `POST …/like`: holds the like key, answering once it's let go. */
  readonly like: PressLike = async (likes) => {
    const request: LikeRequest = { likes };
    const res = await this.fetchFn(roomUrl(this.port, this.roomId, 'like'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<LikeAnswer & ErrorAnswer>;
    if (!res.ok) throw new Error(body.error ?? `room-feed answered ${res.status}`);
    return { liked: body.liked ?? 0, heldMs: body.heldMs ?? 0, tooFast: body.tooFast === true };
  };

  /** `POST …/fans-lamp`: sends today's 粉丝团灯牌, answering once the panel says how it went. */
  readonly sendFansLamp: SendFansLamp = async () => {
    const res = await this.fetchFn(roomUrl(this.port, this.roomId, 'fans-lamp'), {
      method: 'POST',
    });
    const body = (await res.json().catch(() => ({}))) as Partial<FansLampAnswer & ErrorAnswer>;
    if (!res.ok || !body.result) throw new Error(body.error ?? `room-feed answered ${res.status}`);
    return body.result;
  };

  /** `GET …/stream`: the FLV or HLS URL the room's player pulls, or null before it starts. */
  readonly streamUrl: StreamUrl = async () => {
    const res = await this.fetchFn(roomUrl(this.port, this.roomId, 'stream'));
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<StreamAnswer>;
    return body.url ?? null;
  };

  /** `GET …` (the room): the streamer, from the room page, once room-feed has read it. */
  readonly streamer: FindStreamer = async () => {
    const res = await this.fetchFn(roomUrl(this.port, this.roomId));
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<RoomInfoAnswer>;
    const { uid, nickname = '' } = body.room?.meta ?? {};
    return uid ? { uid, nickname } : null;
  };

  /** `GET …/screenshot`: the player as a JPEG. */
  readonly screenshot: Screenshot = async () => {
    const res = await this.fetchFn(roomUrl(this.port, this.roomId, 'screenshot'));
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Partial<ErrorAnswer>;
      throw new Error(body.error ?? `room-feed answered ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  };
}
