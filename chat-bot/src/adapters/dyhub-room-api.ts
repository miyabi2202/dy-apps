import type { FindStreamer, Screenshot, SendChat, StreamUrl } from '../app/ports';

/**
 * One live room's HTTP API on DyHub: send chat, get the stream URL and a screenshot of the
 * player (these need DyHub's browser collector to have the room open), and who the streamer is.
 */
export class DyhubRoomApi {
  private readonly base: string;

  constructor(
    port: number,
    roomId: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.base = `http://localhost:${port}/api/rooms/${roomId}`;
  }

  /** `POST …/chat`. */
  readonly sendChat: SendChat = async (text) => {
    const res = await this.fetchFn(`${this.base}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const body = (await res.json().catch(() => ({}))) as { echoed?: boolean; error?: string };
    if (!res.ok) throw new Error(body.error ?? `DyHub answered ${res.status}`);
    return { echoed: body.echoed === true };
  };

  /** `GET …/stream`: the FLV or HLS URL the room's player pulls, or null before it starts. */
  readonly streamUrl: StreamUrl = async () => {
    const res = await this.fetchFn(`${this.base}/stream`);
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: string };
    return body.url ?? null;
  };

  /** `GET …` (the room): the streamer, from the room page, once DyHub has read it. */
  readonly streamer: FindStreamer = async () => {
    const res = await this.fetchFn(this.base);
    if (!res.ok) return null;
    const body = (await res.json()) as { room?: { meta?: { uid?: string; nickname?: string } } };
    const { uid, nickname = '' } = body.room?.meta ?? {};
    return uid ? { uid, nickname } : null;
  };

  /** `GET …/screenshot`: the player as a JPEG. */
  readonly screenshot: Screenshot = async () => {
    const res = await this.fetchFn(`${this.base}/screenshot`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `DyHub answered ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  };
}
