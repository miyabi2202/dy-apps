import { displayTitle, normaliseTitle, type TitleCandidate } from '@dy-apps/lyrics-search';
import { parseSongAnswer, SONG_ANSWER_SCHEMA, type SongAnswer } from '../../core/songs/song-answer';
import { errorMessage } from '../../core/errors';
import { askJson } from '../models/ask-json';
import type { MusicMatch } from '../../core/songs/music';
import { isSung, othersShare, sungChars, type TranscriptLine } from '../../core/songs/transcript';
import type { AskModel, Log, Question, SearchLyrics } from '../ports';

export interface SongIdOptions {
  /** The prompt (see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  /** Codex, which searches the web live (Google among others), so it finds lyrics. */
  codex: AskModel;
  log: Log;
  now?: () => number;
  /**
   * Shazam on the stream's last 15 s, asked before anything else while the streamer is singing
   * (a sung line ended within SINGING_LATELY_MS): she mostly sings over a backing track, which it
   * names with its song, in about a second. In a 75-minute morning show of 海老夏二 it named the
   * song she was singing in 11 of 15 windows; sung a cappella, or with nothing matched (null) or a
   * failure, the lyrics search and Codex go on as before. Its answer is said with `found`.
   */
  music?: () => Promise<MusicMatch | null>;
  /**
   * NetEase's lyrics search, asked first after Shazam: when it's sure of the title and a singer, the answer
   * comes from it (`found`) and Codex isn't asked; when it isn't (or it fails, or names no
   * singer), Codex is, with its candidates as hints (`hints`).
   */
  lyrics?: SearchLyrics;
  /**
   * The plain message for a song Shazam or the lyrics search named; `artist` is empty when no
   * singer clearly leads. Said when Codex doesn't write one (see `known`), or its message leaves
   * the title out.
   */
  found?: (song: { title: string; artist: string }) => string;
  /**
   * A note added to Codex's prompt naming the song Shazam or the lyrics search found, so Codex only
   * writes the message (searching about the song if it likes). Without it, `found` is said. Not
   * for Claude's tool (`why: 'tool'`), whose own reply is the message.
   */
  known?: (song: { title: string; artist: string }) => string;
  /**
   * Added to Codex's prompt, for a message to the room: whether this one ends with a hook anyone
   * can answer (`on`), rolled each time, one in `hookChance`.
   */
  hookNote?: (on: boolean) => string;
  /** How often a message to the room also gets a hook. */
  hookChance?: number;
  /** 0–1, uniformly; tests pass their own. */
  random?: () => number;
  /** The candidates the lyrics search found but wasn't sure of, as a note added to Codex's prompt. */
  hints?: (candidates: TitleCandidate[]) => string;
  /**
   * Added to the message of a song named when most of what was sung of it (by characters) was
   * another voice's than the streamer's (see othersShare): a 连线, a recording, or the streamer
   * as the voices took her for someone else.
   */
  othersNote?: () => string;
  /**
   * Told each song named for sure, by any path, with when it was asked about (before it's told to
   * the room, if it is): the lyrics song break source keeps it (see LyricsBreaks).
   */
  onNamed?: (song: { title: string; artist: string }, askedAt: number) => void;
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
export type SongIdOutcome = { kind: 'early'; text: string } | ({ kind: 'named' } & Named);

/** A song asked about: the answer (null when Codex's isn't SONG_ANSWER_SCHEMA's shape), who gave it, and whether others sang most of it. */
export interface Named {
  answer: SongAnswer | null;
  text: string;
  by: 'shazam' | 'lyrics-search' | 'codex';
  /** Most of what was sung was another voice's (see othersShare); the message then says so. */
  othersSang: boolean;
}

/** A song told to the room this recently gets no message written for it again (see `written`). */
const TOLD_LATELY_MS = 60 * 60_000;

/** Above this share of the sung characters being another voice's, the message says so. */
const OTHERS_SANG = 0.5;

/**
 * Shazam hears the last 15 s, so it's asked only when a sung line ended this recently: asked
 * after the song, it would name whatever plays now.
 */
const SINGING_LATELY_MS = 15_000;

/**
 * Names the song being sung, for `identify_song` (Claude's, or a typed `/识歌`) and /自动识歌: Shazam
 * first while she's singing, then the lyrics search, both fast; when it isn't sure, Codex searches the web for the lyrics of the current
 * song, with the prompt, and answers in SONG_ANSWER_SCHEMA's shape.
 */
export class SongId {
  /** When each song it named was last named, by normalised title (see normaliseTitle). */
  private readonly named = new Map<string, number>();
  /** The last song it told the room, and when. */
  private last: { song: SongAnswer; at: number } | undefined;

  private readonly now: () => number;

  constructor(private readonly options: SongIdOptions) {
    this.now = options.now ?? Date.now;
  }

  prompt(): string {
    return this.options.prompt();
  }

  /**
   * Names the song, for an answer in SONG_ANSWER_SCHEMA's shape, logged; `answer` is null when
   * Codex's isn't that shape, with the text it was. What it's asked about (`lines`, the song so
   * far) is logged first, `song id asked`: why, how many sung lines and characters, and the first
   * and last of them. Then the lyrics search (`lyrics search`, with how it went), and Codex only
   * when that isn't sure of the title, names no singer, or failed: `song identified` says which answered (`by`).
   */
  async name(
    question: Question,
    about?: { why: SongIdWhy; lines: readonly TranscriptLine[] },
  ): Promise<Named> {
    const { log, lyrics, found, hints, othersNote } = this.options;
    const start = this.now();
    const share = about ? othersShare(about.lines) : 0;
    const othersSang = share > OTHERS_SANG;
    // Marked as others' singing; the note goes after a message there is: an empty one (the same song as
    // last time) stays empty.
    const noted = (answer: SongAnswer): SongAnswer =>
      othersSang
        ? {
            ...answer,
            othersSang,
            ...(othersNote && answer.message && { message: `${answer.message}${othersNote()}` }),
          }
        : answer;
    // A message to the room (not Claude's tool) may end with a hook: the dice are rolled here, as
    // a model can't keep to a rate by itself.
    const toRoom = about !== undefined && about.why !== 'tool';
    const hook =
      toRoom && (this.options.random ?? Math.random)() < (this.options.hookChance ?? 0.25);
    const asked = (prompt: string) =>
      toRoom && this.options.hookNote ? `${prompt}\n\n${this.options.hookNote(hook)}` : prompt;
    const music = about && this.singingLately(about.lines) ? await this.music() : null;
    if (music) {
      const title = displayTitle(music.title) || music.title;
      const answer = await this.written(
        {
          message: (found ?? defaultFound)({ title, artist: music.artist }),
          title,
          artist: music.artist,
          sure: true,
        },
        { ...question, prompt: asked(question.prompt) },
        toRoom && !othersSang,
        hook,
      );
      return this.identified(answer, 'shazam', start, noted, othersSang, {
        before: { shazamTitle: music.title },
      });
    }
    if (about) {
      const sung = about.lines.filter(isSung);
      log.info('song id asked', {
        why: about.why,
        lines: sung.length,
        chars: sungChars(about.lines),
        othersShare: Math.round(share * 100) / 100,
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
        lyricsMs = this.now() - start;
        log.info('lyrics search', {
          why: guess.why,
          ms: guess.ms,
          sure: guess.sure,
          title: guess.title,
          artist: guess.artist,
          artistBy: guess.artistBy,
          artistShare: guess.artistShare,
          queries: guess.queries.length,
          top: guess.candidates.map((c) => `${c.title} ${c.score}`),
        });
        // Sure of the title but no singer clearly leads (闻到): Codex finds the singer, with the
        // candidates as hints.
        const artist = guess.artist ?? '';
        if (guess.sure && guess.title && artist) {
          const answer = await this.written(
            {
              message: (found ?? defaultFound)({ title: guess.title, artist }),
              title: guess.title,
              artist,
              sure: true,
            },
            { ...question, prompt: asked(question.prompt) },
            toRoom && !othersSang,
            hook,
          );
          return this.identified(answer, 'lyrics-search', start, noted, othersSang);
        }
        if (guess.candidates.length && hints) prompt += `\n\n${hints(guess.candidates)}`;
      } catch (err) {
        log.warn('lyrics search failed', { error: errorMessage(err) });
      }
    }
    const { value: answer, text } = await askJson(
      this.options.codex,
      { ...question, prompt: asked(prompt) },
      { schema: SONG_ANSWER_SCHEMA, parse: parseSongAnswer, notJson: 'song id answer is not json' },
      log,
    );
    if (!answer) return { answer, text, by: 'codex', othersSang };
    return this.identified(answer, 'codex', start, noted, othersSang, {
      after: { lyricsMs },
      text,
      notify: answer.sure && !!answer.title,
    });
  }

  /**
   * `song`, named by Shazam or the lyrics search, with the message Codex writes for it to the room
   * (`write`), given the song (`known`) so it needn't find it: its own words, the title woven in.
   * The plain message stays when Codex fails, answers out of shape, or leaves the title out.
   */
  private async written(
    song: SongAnswer,
    question: Question,
    write: boolean,
    hook: boolean,
  ): Promise<SongAnswer> {
    const { known, codex, log } = this.options;
    // A song told lately is still being sung: /自动识歌 says nothing, so nothing to write.
    const told = this.namedAt(song.title);
    if (!write || !known || (told !== undefined && this.now() - told < TOLD_LATELY_MS)) return song;
    try {
      const { value } = await askJson(
        codex,
        { ...question, prompt: `${question.prompt}\n\n${known(song)}` },
        { schema: SONG_ANSWER_SCHEMA, parse: parseSongAnswer, notJson: 'song message is not json' },
        log,
      );
      const message = value?.message ?? '';
      const named = message.includes(song.title);
      log.info('song message', { title: song.title, hook, message, named });
      return named ? { ...song, message } : song;
    } catch (err) {
      log.warn('could not write the song message', { title: song.title, error: errorMessage(err) });
      return song;
    }
  }

  /**
   * The way out of `name` once a path gave an answer: logs `song identified`, tells `onNamed` (when
   * `notify`), and marks the answer for others' voices (`noted`). `before` and `after` are extra
   * log fields around `sure`/`by`/`ms`; `text` is what was said when that isn't the message.
   */
  private identified(
    answer: SongAnswer,
    by: Named['by'],
    start: number,
    noted: (answer: SongAnswer) => SongAnswer,
    othersSang: boolean,
    {
      before,
      after,
      text,
      notify = true,
    }: { before?: object; after?: object; text?: string; notify?: boolean } = {},
  ): Named {
    this.options.log.info('song identified', {
      title: answer.title,
      artist: answer.artist,
      ...before,
      sure: answer.sure,
      by,
      ms: this.now() - start,
      ...after,
    });
    if (notify) this.options.onNamed?.(answer, start);
    const told = noted(answer);
    return { answer: told, text: text ?? told.message, by, othersSang };
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

  /** Whether a line of `lines` was sung within SINGING_LATELY_MS, so Shazam hears the song. */
  private singingLately(lines: readonly TranscriptLine[]): boolean {
    const now = this.now();
    return lines.some((line) => isSung(line) && now - line.end <= SINGING_LATELY_MS);
  }

  /** Shazam's match for the song playing, or null when there's none, it found none, or it failed. */
  private async music(): Promise<MusicMatch | null> {
    if (!this.options.music) return null;
    try {
      const match = await this.options.music();
      if (!match) this.options.log.info('shazam found no song');
      return match;
    } catch (err) {
      this.options.log.warn('shazam failed', { error: errorMessage(err) });
      return null;
    }
  }

  /** When `title` was last told to the room (by /识歌 or on its own), if it was. */
  namedAt(title: string): number | undefined {
    return this.named.get(normaliseTitle(title));
  }

  /** The last song told to the room (by /识歌 or on its own), and when; undefined for none yet. */
  lastTold(): { song: SongAnswer; at: number } | undefined {
    return this.last;
  }

  /** Remembers that `song` was told to the room now, when it's sure of it. */
  told(song: SongAnswer): void {
    if (!song.title || !song.sure) return;
    const at = this.now();
    this.named.set(normaliseTitle(song.title), at);
    this.last = { song, at };
  }
}

/** What's said when the lyrics search named the song, if the wiring gives no wording. */
const defaultFound = ({ title, artist }: { title: string; artist: string }) =>
  `这首是${artist}《${title}》`;
