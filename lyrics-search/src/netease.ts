import type { Hit, RateLimit } from './types';

const URL_BASE = 'https://music.163.com/api/cloudsearch/pc';
/** NetEase's search type for lyrics. */
const LYRICS = '1006';
/** NetEase's search type for song titles. */
const TITLES = '1';

interface NeteaseSong {
  name?: string;
  id?: number;
  ar?: { name?: string }[] | null;
  pop?: number | null;
}

/** The songs of a search response; a failed one (`code` not 200) throws. */
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

/**
 * NetEase's searches: by lyrics (the songs whose lyrics contain a line) and by title. Both throw
 * on HTTP errors, timeouts, bad JSON and a response that isn't `code: 200`.
 */
export function neteaseClient(options: NeteaseClientOptions = {}) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 3000;

  async function search(text: string, type: string, limit: number): Promise<Hit[]> {
    await options.limit?.();
    const query = new URLSearchParams({ s: text, type, limit: String(limit) });
    const response = await doFetch(`${URL_BASE}?${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`netease answered HTTP ${response.status}`);
    return parseLyricsResponse(await response.json());
  }

  return {
    searchLyrics: (text: string): Promise<Hit[]> => search(text, LYRICS, 10),
    /** The recordings titled `title`, best first, each with its singers. */
    searchTitle: (title: string): Promise<Hit[]> => search(title, TITLES, 20),
  };
}
