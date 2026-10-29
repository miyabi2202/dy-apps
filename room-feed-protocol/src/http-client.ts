import {
  roomUrl,
  type ChatAnswer,
  type ChatRequest,
  type ErrorAnswer,
  type FansLampAnswer,
  type LikeAnswer,
  type LikeRequest,
  type RoomAction,
  type RoomInfoAnswer,
  type StreamAnswer,
} from './api';

export interface RoomFeedHttpOptions {
  port: number;
  roomId: string;
  /** The global fetch by default; tests pass a fake. */
  fetch?: typeof fetch;
}

/** The message of a failed answer: room-feed's own, else its status. */
function failure(res: Response, body: Partial<ErrorAnswer>): Error {
  return new Error(body.error ?? `room-feed answered ${res.status}`);
}

/**
 * One live room's HTTP API on room-feed (see api.ts): send chat, like, send the 灯牌, get the
 * stream URL, the room's info and a screenshot of the player. A failed call throws room-feed's own
 * message, or `room-feed answered <status>` when it didn't send one.
 */
export class RoomFeedHttp {
  private readonly port: number;
  private readonly roomId: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: RoomFeedHttpOptions) {
    this.port = options.port;
    this.roomId = options.roomId;
    this.fetchFn = options.fetch ?? fetch;
  }

  /** `POST …/chat`: `echoed` once the chat came back in the room's push stream. */
  async sendChat(text: string): Promise<{ echoed: boolean }> {
    const request: ChatRequest = { text };
    const res = await this.post('chat', request);
    const body = (await res.json().catch(() => ({}))) as Partial<ChatAnswer & ErrorAnswer>;
    if (!res.ok) throw failure(res, body);
    return { echoed: body.echoed === true };
  }

  /** `POST …/like`: holds the like key, answering once it's let go. */
  async like(likes: number): Promise<Omit<LikeAnswer, 'ok'>> {
    const request: LikeRequest = { likes };
    const res = await this.post('like', request);
    const body = (await res.json().catch(() => ({}))) as Partial<LikeAnswer & ErrorAnswer>;
    if (!res.ok) throw failure(res, body);
    return { liked: body.liked ?? 0, heldMs: body.heldMs ?? 0, tooFast: body.tooFast === true };
  }

  /** `POST …/fans-lamp`: sends today's 粉丝团灯牌, answering once the panel says how it went. */
  async sendFansLamp(): Promise<FansLampAnswer['result']> {
    const res = await this.fetchFn(roomUrl(this.port, this.roomId, 'fans-lamp'), {
      method: 'POST',
    });
    const body = (await res.json().catch(() => ({}))) as Partial<FansLampAnswer & ErrorAnswer>;
    if (!res.ok || !body.result) throw failure(res, body);
    return body.result;
  }

  /** `GET …/stream`: the FLV or HLS URL the room's player pulls, or null before it starts. */
  async streamUrl(): Promise<string | null> {
    const res = await this.fetchFn(roomUrl(this.port, this.roomId, 'stream'));
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<StreamAnswer>;
    return body.url ?? null;
  }

  /** `GET …` (the room): its status, streamer and login; null when room-feed doesn't answer ok. */
  async roomInfo(): Promise<Partial<RoomInfoAnswer['room']> | null> {
    const res = await this.fetchFn(roomUrl(this.port, this.roomId));
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<RoomInfoAnswer>;
    return body.room ?? {};
  }

  /** `GET …/screenshot`: the player as a JPEG. */
  async screenshot(): Promise<Uint8Array> {
    const res = await this.fetchFn(roomUrl(this.port, this.roomId, 'screenshot'));
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Partial<ErrorAnswer>;
      throw failure(res, body);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  private post(action: RoomAction, body: ChatRequest | LikeRequest): Promise<Response> {
    return this.fetchFn(roomUrl(this.port, this.roomId, action), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}
