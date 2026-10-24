import type { Hit, RateLimit } from './types';

const URL_BASE = 'https://music.163.com/api/cloudsearch/pc';
const LYRIC_URL = 'https://music.163.com/api/song/lyric';
/** NetEase's search type for lyrics. */
const LYRICS = '1006';
/** NetEase's search type for song titles. */
const TITLES = '1';

interface NeteaseSong {
  name?: string;
  id?: number;
  ar?: { name?: string }[] | null;
  pop?: number | null;
  /** 1 an original, 2 a cover; 0 and the rest unknown. */
  originCoverType?: number | null;
  /** On a cover, the song it covers, when NetEase links one. */
  originSongSimpleData?: { name?: string; artists?: { name?: string }[] | null } | null;
}

const names = (artists: { name?: string }[] | null | undefined): string[] =>
  (artists ?? []).flatMap((a) => (a.name ? [a.name] : []));

/** The songs of a search response; a failed one (`code` not 200) throws. */
export function parseLyricsResponse(body: unknown): Hit[] {
  const response = body as { code?: number; result?: { songs?: NeteaseSong[] | null } | null };
  if (response?.code !== 200) throw new Error(`netease answered code ${String(response?.code)}`);
  return (response.result?.songs ?? []).flatMap((song) =>
    song.name
      ? [
          {
            title: song.name,
            artists: names(song.ar),
            pop: song.pop ?? 0,
            ...(song.id === undefined ? {} : { id: song.id }),
            ...(song.originCoverType === 1 && { cover: false }),
            ...(song.originCoverType === 2 && { cover: true }),
            ...(song.originSongSimpleData?.name && {
              coverOf: {
                title: song.originSongSimpleData.name,
                artists: names(song.originSongSimpleData.artists),
              },
            }),
          },
        ]
      : [],
  );
}

/** LRC timestamps, `[00:28.950]`, any number of them at the start of a line. */
const TIMESTAMPS = /^(\[\d+:\d+(?:[.:]\d+)?\])+/;
/** A credit line, `作词 : 周杰伦` or `原唱：CRITTY`: a short role, then a colon. */
const CREDIT = /^[^:：]{1,12}[:：]/;

/**
 * The sung lines of a lyric response (`/api/song/lyric`): its LRC without timestamps, empty lines
 * and credit lines; empty for an instrumental (`pureMusic`) or a song with no lyrics. A failed one
 * (`code` not 200) throws.
 */
export function parseLyricResponse(body: unknown): string[] {
  const response = body as { code?: number; lrc?: { lyric?: string | null } | null };
  if (response?.code !== 200) throw new Error(`netease answered code ${String(response?.code)}`);
  return (response.lrc?.lyric ?? '')
    .split('\n')
    .map((line) => line.replace(TIMESTAMPS, '').trim())
    .filter((line) => line && !CREDIT.test(line));
}

export interface NeteaseClientOptions {
  fetch?: typeof fetch;
  /** Per request. */
  timeoutMs?: number;
  /** Awaited before each request. */
  limit?: RateLimit;
}

/**
 * NetEase's searches, by lyrics (the songs whose lyrics contain a line) and by title, and a song's
 * lyrics. All throw on HTTP errors, timeouts, bad JSON and a response that isn't `code: 200`.
 */
export function neteaseClient(options: NeteaseClientOptions = {}) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 3000;

  async function get(url: string, query: URLSearchParams): Promise<unknown> {
    await options.limit?.();
    const response = await doFetch(`${url}?${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`netease answered HTTP ${response.status}`);
    return response.json();
  }

  async function search(text: string, type: string, limit: number): Promise<Hit[]> {
    const query = new URLSearchParams({ s: text, type, limit: String(limit) });
    return parseLyricsResponse(await get(URL_BASE, query));
  }

  return {
    searchLyrics: (text: string): Promise<Hit[]> => search(text, LYRICS, 10),
    /** The recordings titled `title`, best first, each with its singers. */
    searchTitle: (title: string): Promise<Hit[]> => search(title, TITLES, 20),
    /** The sung lines of the song NetEase numbers `id` (see parseLyricResponse). */
    lyrics: async (id: number): Promise<string[]> =>
      parseLyricResponse(await get(LYRIC_URL, new URLSearchParams({ id: String(id), lv: '1' }))),
  };
}
