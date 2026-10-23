/** A sung line: a string counts as sung; `sung: false` (spoken) is skipped. */
export type SungLine = string | { text: string; sung?: boolean };

/** One song NetEase returned for a lyrics query. */
export interface Hit {
  title: string;
  artists: string[];
  /** NetEase's popularity, 0–100. */
  pop: number;
  id?: number;
  /** NetEase's own mark (`originCoverType`): true for a cover (2), false for an original (1); unknown otherwise. */
  cover?: boolean;
  /** The song a cover says it covers (`originSongSimpleData`), when NetEase links one. */
  coverOf?: { title: string; artists: string[] };
}

/** A title the search found, for Codex's hints and the log. */
export interface TitleCandidate {
  /** The display title. */
  title: string;
  score: number;
  /** The top three singers by weight. */
  artists: string[];
  /**
   * The top three singers NetEase marks as the original (or that a cover names as its original),
   * and those it marks as covering it: for Codex's hints, as the search's order doesn't tell.
   */
  originals: string[];
  covers: string[];
}

/** What the search made of the lines. */
export interface SongGuess {
  /** The display title of the winner; '' when none. */
  title: string;
  /**
   * Only when NetEase's marks clearly name the original (`pickOriginal`), or else one singer
   * clearly owns the title (`pickArtist`); `artistBy` says which.
   */
  artist?: string;
  artistBy?: 'marks' | 'share';
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
