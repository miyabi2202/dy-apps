/** The player's stream request: FLV or HLS. */
export const STREAM_URL = /^https?:\/\/[^/]+\/.+\.(flv|m3u8)(\?|$)/;

/** The part of webcast/room/web/enter/'s answer we read. */
export interface EnterAnswer {
  data?: {
    data?: {
      id_str?: string;
      status?: number;
      stream_url?: { flv_pull_url?: Record<string, string> };
    }[];
  };
}

/** The room as webcast/room/web/enter/ tells it. */
export interface Entered {
  /** The internal room id push messages carry (not the web one in the URL); '' if missing. */
  innerRoomId: string;
  /** The stream has ended, or not started: status 4 (2 is live). */
  ended: boolean;
  /** An FLV URL: the lowest quality, since all sound alike; null if none. */
  flvUrl: string | null;
}

export function readEnterAnswer(body: EnterAnswer): Entered | null {
  const room = body.data?.data?.[0];
  if (!room) return null;
  return { innerRoomId: room.id_str ?? '', ended: room.status === 4, flvUrl: flvUrl(room) };
}

export function flvUrl(room: NonNullable<NonNullable<EnterAnswer['data']>['data']>[number]) {
  const urls = room.stream_url?.flv_pull_url;
  if (!urls) return null;
  for (const quality of ['SD2', 'SD1', 'HD1', 'FULL_HD1']) {
    if (urls[quality]) return urls[quality];
  }
  return Object.values(urls)[0] ?? null;
}

/** Whether an enter request is for room `roomId`: the page asks again for a room it moves to. */
export function isEnterOf(url: string, roomId: string): boolean {
  if (!url.includes('/webcast/room/web/enter/')) return false;
  return new URL(url).searchParams.get('web_rid') === roomId;
}
