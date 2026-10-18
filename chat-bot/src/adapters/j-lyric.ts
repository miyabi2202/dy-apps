import type { LyricsSearch } from '../app/ports';
import type { LyricHit } from '../core/lyrics';

export interface JLyricOptions {
  fetch?: typeof globalThis.fetch;
  /** Give up on one search after this long. */
  timeoutMs?: number;
}

/** One result on j-lyric's search page: the song's link and title, then its singer. */
const RESULT =
  /<p class="mid"><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/p>\s*<p class="sml">歌：<a[^>]*>([^<]+)<\/a>/g;

const unescape = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The songs on j-lyric.net's search results page `html`. */
export function parseJLyricResults(html: string): LyricHit[] {
  return [...html.matchAll(RESULT)].map(([, path = '', title = '', artist = '']) => ({
    title: unescape(title).trim(),
    artist: unescape(artist).trim(),
    url: new URL(path, 'https://j-lyric.net/').href,
  }));
}

/**
 * Searches j-lyric.net, a Japanese lyrics site, for songs whose lyrics contain a fragment
 * (its first page of results).
 */
export function jLyricSearch({
  fetch = globalThis.fetch,
  timeoutMs = 8000,
}: JLyricOptions = {}): LyricsSearch {
  return async (fragment) => {
    const url = new URL('https://j-lyric.net/search.php');
    url.searchParams.set('kl', fragment);
    // Lyrics containing it, rather than starting with it.
    url.searchParams.set('cl', '2');
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`j-lyric answered ${response.status}`);
    return parseJLyricResults(await response.text());
  };
}
