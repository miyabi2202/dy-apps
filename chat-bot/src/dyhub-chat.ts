/** Sends one chat message to the live room as DyHub's logged-in account. */
export type SendChat = (text: string) => Promise<SendResult>;

export interface SendResult {
  /** Whether the message came back in the room's chat stream, i.e. Douyin took it. */
  echoed: boolean;
}

/** DyHub's `POST /api/rooms/:roomId/chat`. */
export function dyhubChat(port: number, roomId: string, fetchFn: typeof fetch = fetch): SendChat {
  const url = `http://localhost:${port}/api/rooms/${roomId}/chat`;
  return async (text) => {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const body = (await res.json().catch(() => ({}))) as { echoed?: boolean; error?: string };
    if (!res.ok) throw new Error(body.error ?? `DyHub answered ${res.status}`);
    return { echoed: body.echoed === true };
  };
}
