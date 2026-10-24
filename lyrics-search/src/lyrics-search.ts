import { markedSingers, pickArtist, pickOriginal, rankSingers } from './artist';
import { CircuitBreaker, minGap } from './limits';
import { neteaseClient } from './netease';
import { displayTitle, foldArtist, normaliseTitle } from './normalise';
import { lyricQueries } from './queries';
import type { Hit, RateLimit, SongGuess, SungLine } from './types';
import { decideTitle, vote } from './vote';

export interface LyricsSearchOptions {
  fetch?: typeof fetch;
  now?: () => number;
  /** Per request. */
  timeoutMs?: number;
  limit?: RateLimit;
  breaker?: CircuitBreaker;
  /** Lines searched at most. */
  maxQueries?: number;
  /** The winner's least score to be sure. */
  minScore?: number;
  /** How many times the runner-up's score the winner needs. */
  minRatio?: number;
  /** The top singer's least share of the winning title's lyric and title hits to be named. */
  artistShare?: number;
}

/**
 * Names a song from the lines sung: each of the longest lines is a NetEase lyrics search, and
 * the titles they agree on win. Sure when the winner has a score and a clear lead; the singer
 * only when one owns the title. Never throws: a NetEase that fails or is shut out by the breaker
 * is an unsure answer, so the caller can fall back to something slower.
 */
export class LyricsSearch {
  private readonly now: () => number;
  private readonly client: ReturnType<typeof neteaseClient>;
  private readonly breaker: CircuitBreaker;
  private readonly maxQueries: number;
  private readonly minScore: number;
  private readonly minRatio: number;
  private readonly artistShare: number;

  constructor(options: LyricsSearchOptions = {}) {
    this.now = options.now ?? Date.now;
    this.client = neteaseClient({
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      limit: options.limit ?? minGap(100, this.now),
    });
    this.breaker =
      options.breaker ?? new CircuitBreaker({ failures: 3, offMs: 10 * 60_000, now: this.now });
    this.maxQueries = options.maxQueries ?? 5;
    this.minScore = options.minScore ?? 1.0;
    this.minRatio = options.minRatio ?? 1.5;
    this.artistShare = options.artistShare ?? 0.4;
  }

  async identify(lines: readonly SungLine[]): Promise<SongGuess> {
    const start = this.now();
    const queries = lyricQueries(lines, this.maxQueries);
    const unsure = (why: string): SongGuess => ({
      title: '',
      sure: false,
      candidates: [],
      why,
      queries,
      ms: this.now() - start,
    });
    if (queries.length < 2) return unsure('too few lines');
    if (this.breaker.open()) return unsure('netease down');

    const answers = await Promise.all(
      queries.map((q) => this.client.searchLyrics(q).catch(() => null)),
    );
    if (answers.every((answer) => answer === null)) {
      this.breaker.failure();
      return unsure('netease failed');
    }
    this.breaker.success();

    const { ranked, hitsBy } = vote(answers.map((answer) => answer ?? []));
    const decision = decideTitle(ranked, queries.length, this.minScore, this.minRatio);
    const candidates = ranked.slice(0, 3).map(([key, score]) => {
      const hits = hitsBy.get(key) ?? [];
      return {
        title: displayTitle(hits[0]?.title ?? key),
        score: Math.round(score * 100) / 100,
        artists: rankSingers(hits)
          .slice(0, 3)
          .map((s) => s.artist),
        ...markedSingers(hits),
      };
    });
    const winner = ranked[0];
    const guess: SongGuess = {
      title: candidates[0]?.title ?? '',
      sure: decision.sure,
      candidates,
      why: decision.why,
      queries,
      ms: 0,
    };
    if (decision.sure && winner) {
      const lyricHits: Hit[] = hitsBy.get(winner[0]) ?? [];
      // One more request, for the singer: a failed one leaves the lyric hits to decide.
      const titleHits = (await this.client.searchTitle(guess.title).catch(() => [])).filter(
        (hit) => normaliseTitle(hit.title) === winner[0],
      );
      // NetEase's own marks first: a cover can lead the hits as often as not. Only on the versions
      // whose lyrics matched: the title search also finds other songs by the same name (忘了).
      const original = pickOriginal(winner[0], lyricHits);
      const { artist, share } = original.artist
        ? { artist: original.artist, share: original.share }
        : pickArtist({ lyricHits, titleHits }, this.artistShare);
      if (artist) guess.artistBy = original.artist ? 'marks' : 'share';
      // The title search finds versions the lyrics search missed, with their marks: for the hints.
      const [first] = candidates;
      if (first) candidates[0] = { ...first, ...markedSingers([...lyricHits, ...titleHits]) };
      if (artist) guess.artist = artist;
      guess.artistShare = share;
      // The version whose lyrics matched best, for the lyrics the song is then checked against.
      const id = lyricHits.find((hit) => hit.id !== undefined)?.id;
      if (id !== undefined) guess.id = id;
    }
    guess.ms = this.now() - start;
    return guess;
  }

  /**
   * NetEase's numbers for the versions of `title`, for a song named another way (by Codex): those
   * with a singer in `artist` first, then the rest, each in NetEase's order. Empty when there's
   * none, or NetEase fails or is down.
   */
  async lookup(title: string, artist = ''): Promise<number[]> {
    const key = normaliseTitle(title);
    if (!key) return [];
    const hits = await this.ask(() => this.client.searchTitle(title));
    const same = (hits ?? []).filter(
      (hit) => hit.id !== undefined && normaliseTitle(hit.title) === key,
    );
    const credit = foldArtist(artist);
    const sungBy = (hit: Hit) =>
      hit.artists.some((a) => {
        const singer = foldArtist(a);
        return singer !== '' && credit.includes(singer);
      });
    return [...same.filter(sungBy), ...same.filter((hit) => !sungBy(hit))].flatMap((hit) =>
      hit.id === undefined ? [] : [hit.id],
    );
  }

  /**
   * The sung lines of the song NetEase numbers `id` (see parseLyricResponse): empty when it has
   * none (an instrumental), or NetEase fails or is down.
   */
  async lyrics(id: number): Promise<string[]> {
    return (await this.ask(() => this.client.lyrics(id))) ?? [];
  }

  /**
   * The sung lines of `title` by `artist`: those of the first `versions` versions with lyrics
   * (see lookup), of the first `tries`, run together. A version's lyrics may be cut short or
   * differ from what's sung, and an instrumental shares the title. Empty when none has lyrics, or
   * NetEase fails or is down.
   */
  async songLyrics(
    title: string,
    artist = '',
    { versions = 3, tries = 5 }: { versions?: number; tries?: number } = {},
  ): Promise<string[]> {
    const found: string[][] = [];
    for (const id of (await this.lookup(title, artist)).slice(0, tries)) {
      if (found.length >= versions) break;
      const lines = await this.lyrics(id);
      if (lines.length) found.push(lines);
    }
    return found.flat();
  }

  /** One request through the breaker: null when it's open or the request fails. */
  private async ask<T>(request: () => Promise<T>): Promise<T | null> {
    if (this.breaker.open()) return null;
    try {
      const answer = await request();
      this.breaker.success();
      return answer;
    } catch {
      this.breaker.failure();
      return null;
    }
  }
}
