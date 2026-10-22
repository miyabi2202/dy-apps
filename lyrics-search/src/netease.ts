import type { Hit, RateLimit } from './types';

const URL_BASE = 'https://music.163.com/api/cloudsearch/pc';
/** NetEase's search type for lyrics (1 is song titles). */
const LYRICS = '1006';

interface NeteaseSong {
  name?: string;
  id?: number;
  ar?: { name?: string }[] | null;
  pop?: number | null;
}

/** The songs of a lyrics search response; a failed one (`code` not 200) throws. */
export function parseLyricsResponse(body: unknown): Hit[] {
  const response = body as { code?: number; result?: { songs?: NeteaseSong[] | null } | null };
  if (response?.code !== 200) throw new Error(`netease answered code ${String(response?.code)}`);
  return (response.result?.songs ?? []).flatMap((song) =>
    song.name
      ? [
          {
            title: song.name,
            artists: (song.ar ?? []).flatMap((a) => (a.name ? [a.name] : [])),
            pop: song.pop ?? 0,
            ...(song.id === undefined ? {} : { id: song.id }),
          },
        ]
      : [],
  );
}

export interface NeteaseClientOptions {
  fetch?: typeof fetch;
  /** Per request. */
  timeoutMs?: number;
  /** Awaited before each request. */
  limit?: RateLimit;
}

/** NetEase's lyrics search: the songs whose lyrics contain the text, best first. */
export function neteaseClient(options: NeteaseClientOptions = {}) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 3000;
  return {
    /** Throws on HTTP errors, timeouts, bad JSON and a response that isn't `code: 200`. */
    async searchLyrics(text: string): Promise<Hit[]> {
      await options.limit?.();
      const url = `${URL_BASE}?${new URLSearchParams({ s: text, type: LYRICS, limit: '10' })}`;
      const response = await doFetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`netease answered HTTP ${response.status}`);
      return parseLyricsResponse(await response.json());
    },
  };
}
