/** A sung line: a string counts as sung; `sung: false` (spoken) is skipped. */
export type SungLine = string | { text: string; sung?: boolean };

/** One song NetEase returned for a lyrics query. */
export interface Hit {
  title: string;
  artists: string[];
  /** NetEase's popularity, 0–100. */
  pop: number;
  id?: number;
}

/** A title the search found, for Codex's hints and the log. */
export interface TitleCandidate {
  /** The display title. */
  title: string;
  score: number;
  /** The top three singers by weight. */
  artists: string[];
}

/** What the search made of the lines. */
export interface SongGuess {
  /** The display title of the winner; '' when none. */
  title: string;
  /** Only when one singer clearly owns the title (see `pickArtist`). */
  artist?: string;
  /** About the title. */
  sure: boolean;
  /** The top three, for Codex's hints and the log. */
  candidates: TitleCandidate[];
  /** A short reason: 'too few lines', 'no hits', 'score 2.0 vs 1.0', 'netease down', … */
  why: string;
  /** The top singer's share, 0–1, for the log. */
  artistShare?: number;
  queries: string[];
  /** Total, by the injected clock. */
  ms: number;
}

/** Waits until another request may go out. */
export type RateLimit = () => Promise<void>;
