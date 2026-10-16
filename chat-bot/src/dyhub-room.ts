/** Sends one chat message to the live room as DyHub's logged-in account. */
export type SendChat = (text: string) => Promise<SendResult>;

export interface SendResult {
  /** Whether the message came back in the room's chat stream, i.e. Douyin took it. */
  echoed: boolean;
}

/**
 * One live room's HTTP API on DyHub: send chat, and get the stream URL and a screenshot of the
 * player. All three need DyHub's browser collector to have the room open.
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
  readonly streamUrl = async (): Promise<string | null> => {
    const res = await this.fetchFn(`${this.base}/stream`);
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: string };
    return body.url ?? null;
  };

  /** `GET …/screenshot`: the player as a JPEG. */
  readonly screenshot = async (): Promise<Uint8Array> => {
    const res = await this.fetchFn(`${this.base}/screenshot`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `DyHub answered ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  };
}
