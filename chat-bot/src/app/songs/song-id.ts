import { normaliseTitle, type TitleCandidate } from '@dy-apps/lyrics-search';
import { parseSongAnswer, SONG_ANSWER_SCHEMA, type SongAnswer } from '../../core/songs/song-answer';
import { errorMessage } from '../../core/errors';
import { askJson } from '../models/ask-json';
import { isSung, sungChars, type TranscriptLine } from '../../core/songs/transcript';
import type { AskModel, Log, Question, SearchLyrics } from '../ports';

export interface SongIdOptions {
  /** The prompt (see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  /** Codex, which searches the web live (Google among others), so it finds lyrics. */
  codex: AskModel;
  log: Log;
  now?: () => number;
  /**
   * NetEase's lyrics search, asked first: when it's sure of the title, the answer comes from it
   * (`found`) and Codex isn't asked; when it isn't (or it fails), Codex is, with its candidates
   * as hints (`hints`).
   */
  lyrics?: SearchLyrics;
  /** The message to send when the lyrics search named the song; `artist` is empty when no singer clearly leads. */
  found?: (song: { title: string; artist: string }) => string;
  /** The candidates the lyrics search found but wasn't sure of, as a note added to Codex's prompt. */
  hints?: (candidates: TitleCandidate[]) => string;
  /** Told each song named to the room, after its message, to say more about it. */
  onTold?: (song: SongAnswer) => void;
  /**
   * What `/识歌` answers, with no model asked, when the song so far has under `minChars` sung
   * characters: `noLyrics` when nothing was sung, `tooEarly` (with `{{heard}}`, the latest lines)
   * otherwise.
   */
  early?: { minChars: number; noLyrics: () => string; tooEarly: (heard: string) => string };
}

/** Why the song is asked about: `/识歌`, /自动识歌 on its own or asking again, or Claude's tool. */
export type SongIdWhy = 'command' | 'auto' | 'retry' | 'tool';

/** What asking about the song came to: too little sung to go on, or the song named (or not). */
export type SongIdOutcome =
  | { kind: 'early'; text: string }
  | { kind: 'named'; answer: SongAnswer | null; text: string; by: 'lyrics-search' | 'codex' };

/**
 * Names the song being sung, for `identify_song` (Claude's, or a typed `/识歌`) and /自动识歌: the lyrics search
 * first, which is fast; when it isn't sure, Codex searches the web for the lyrics of the current
 * song, with the prompt, and answers in SONG_ANSWER_SCHEMA's shape.
 */
export class SongId {
  /** When each song it named was last named, by normalised title (see normaliseTitle). */
  private readonly named = new Map<string, number>();
  /** The last song it told the room, and when. */
  private last: { song: SongAnswer; at: number } | undefined;

  constructor(private readonly options: SongIdOptions) {}

  prompt(): string {
    return this.options.prompt();
  }

  /**
   * Names the song, for an answer in SONG_ANSWER_SCHEMA's shape, logged; `answer` is null when
   * Codex's isn't that shape, with the text it was. What it's asked about (`lines`, the song so
   * far) is logged first, `song id asked`: why, how many sung lines and characters, and the first
   * and last of them. Then the lyrics search (`lyrics search`, with how it went), and Codex only
   * when that isn't sure of the title (or failed): `song identified` says which answered (`by`).
   */
  async name(
    question: Question,
    about?: { why: SongIdWhy; lines: readonly TranscriptLine[] },
  ): Promise<{ answer: SongAnswer | null; text: string; by: 'lyrics-search' | 'codex' }> {
    const { log, lyrics, found, hints } = this.options;
    const now = this.options.now ?? Date.now;
    const start = now();
    if (about) {
      const sung = about.lines.filter(isSung);
      log.info('song id asked', {
        why: about.why,
        lines: sung.length,
        chars: sungChars(about.lines),
        first: sung[0]?.text,
        last: sung.at(-1)?.text,
      });
    }
    let prompt = question.prompt;
    let lyricsMs: number | undefined;
    if (lyrics && about) {
      try {
        const guess = await lyrics(
          about.lines.map((line) => ({ text: line.text, sung: isSung(line) })),
        );
        lyricsMs = now() - start;
        log.info('lyrics search', {
          why: guess.why,
          ms: guess.ms,
          sure: guess.sure,
          title: guess.title,
          artist: guess.artist,
          artistShare: guess.artistShare,
          queries: guess.queries.length,
          top: guess.candidates.map((c) => `${c.title} ${c.score}`),
        });
        if (guess.sure && guess.title) {
          const artist = guess.artist ?? '';
          const answer: SongAnswer = {
            message: (found ?? defaultFound)({ title: guess.title, artist }),
            title: guess.title,
            artist,
            sure: true,
          };
          log.info('song identified', {
            title: answer.title,
            artist,
            sure: true,
            by: 'lyrics-search',
            ms: now() - start,
          });
          return { answer, text: answer.message, by: 'lyrics-search' };
        }
        if (guess.candidates.length && hints) prompt += `\n\n${hints(guess.candidates)}`;
      } catch (err) {
        log.warn('lyrics search failed', { error: errorMessage(err) });
      }
    }
    const { value: answer, text } = await askJson(
      this.options.codex,
      { ...question, prompt },
      { schema: SONG_ANSWER_SCHEMA, parse: parseSongAnswer, notJson: 'song id answer is not json' },
      log,
    );
    if (!answer) return { answer, text, by: 'codex' };
    log.info('song identified', {
      title: answer.title,
      artist: answer.artist,
      sure: answer.sure,
      by: 'codex',
      ms: now() - start,
      lyricsMs,
    });
    return { answer, text, by: 'codex' };
  }

  /**
   * Asks about the song in `lines` (the song so far): with under `early.minChars` sung characters,
   * what that says, without asking anyone; otherwise `name`. The entry for `/识歌` and the tool.
   */
  async identifyLines(
    question: Question,
    lines: readonly TranscriptLine[],
    why: SongIdWhy,
  ): Promise<SongIdOutcome> {
    const { early, log } = this.options;
    const chars = sungChars(lines);
    if (early && chars < early.minChars) {
      log.info('song id: too little sung yet', { chars });
      if (!chars) return { kind: 'early', text: early.noLyrics() };
      const heard = lines
        .filter(isSung)
        .slice(-2)
        .map((line) => line.text)
        .join('」「');
      return { kind: 'early', text: early.tooEarly(heard) };
    }
    return { kind: 'named', ...(await this.name(question, { why, lines })) };
  }

  /** When `title` was last told to the room (by /识歌 or on its own), if it was. */
  namedAt(title: string): number | undefined {
    return this.named.get(normaliseTitle(title));
  }

  /** The last song told to the room (by /识歌 or on its own), and when; undefined for none yet. */
  lastTold(): { song: SongAnswer; at: number } | undefined {
    return this.last;
  }

  /**
   * Remembers that `song` was told to the room now (when it's sure of it), and says so (`onTold`:
   * the song intro). Claude's own reply is the intro when it answered through the tool, so that
   * passes `introduce: false`.
   */
  told(song: SongAnswer, { introduce = true }: { introduce?: boolean } = {}): void {
    if (!song.title || !song.sure) return;
    const at = (this.options.now ?? Date.now)();
    this.named.set(normaliseTitle(song.title), at);
    this.last = { song, at };
    if (introduce) this.options.onTold?.(song);
  }
}

/** What's said when the lyrics search named the song, if the wiring gives no wording. */
const defaultFound = ({ title, artist }: { title: string; artist: string }) =>
  `这首是${artist}《${title}》`;
