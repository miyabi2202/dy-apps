import { rankSingers, pickArtist } from './artist';
import { CircuitBreaker, minGap } from './limits';
import { neteaseClient } from './netease';
import { displayTitle } from './normalise';
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
  /** The top singer's least share of the winning title's hits to be named. */
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
    this.artistShare = options.artistShare ?? 0.5;
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
      const winnerHits: Hit[] = hitsBy.get(winner[0]) ?? [];
      const { artist, share } = pickArtist(winnerHits, this.artistShare);
      if (artist) guess.artist = artist;
      guess.artistShare = share;
    }
    guess.ms = this.now() - start;
    return guess;
  }
}
