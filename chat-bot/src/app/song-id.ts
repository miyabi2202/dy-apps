import { parseSongAnswer, SONG_ANSWER_SCHEMA, type SongAnswer } from '../core/song-answer';
import { askJson } from './ask-json';
import type { Command } from './command';
import { currentSong, isSung, sungChars, type TranscriptLine } from '../core/transcript';
import type { AskModel, Log, Question } from './ports';

export interface SongIdOptions {
  /** The prompt (see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  /** Codex, which searches the web live (Google among others), so it finds lyrics. */
  codex: AskModel;
  log: Log;
  now?: () => number;
  /** Told each song named to the room, after its message, to say more about it. */
  onTold?: (song: SongAnswer) => void;
  /**
   * What `/识歌` answers, with no model asked, when the song so far has under `minChars` sung
   * characters: `noLyrics` when nothing was sung, `tooEarly` (with `{{heard}}`, the latest lines)
   * otherwise.
   */
  early?: { minChars: number; noLyrics: () => string; tooEarly: (heard: string) => string };
}

/** Why the model is asked: `/识歌`, or /自动识歌 on its own or asking again. */
export type SongIdWhy = 'command' | 'auto' | 'retry';

/**
 * Names the song being sung, for `/识歌` and /自动识歌: Codex searches for the lyrics of the
 * current song, with the prompt, and answers in SONG_ANSWER_SCHEMA's shape.
 */
export class SongId {
  /** When each song it named was last named, by title. */
  private readonly named = new Map<string, number>();
  /** The last song it told the room, and when. */
  private last: { song: SongAnswer; at: number } | undefined;
  /** The song `/识歌` last picked from the transcript, for its prompt. */
  private picked: TranscriptLine[] = [];

  constructor(private readonly options: SongIdOptions) {}

  prompt(): string {
    return this.options.prompt();
  }

  /**
   * Asks Codex to name the song, for an answer in SONG_ANSWER_SCHEMA's shape, logged; null when
   * the answer isn't that shape, with the text it was. What it's asked about (`lines`, the song
   * so far) is logged first, `song id asked`: why, how many sung lines and characters, and the
   * first and last of them.
   */
  async name(
    question: Question,
    about?: { why: SongIdWhy; lines: readonly TranscriptLine[] },
  ): Promise<{ answer: SongAnswer | null; text: string }> {
    if (about) {
      const sung = about.lines.filter(isSung);
      this.options.log.info('song id asked', {
        why: about.why,
        lines: sung.length,
        chars: sungChars(about.lines),
        first: sung[0]?.text,
        last: sung.at(-1)?.text,
      });
    }
    const { value: answer, text } = await askJson(
      this.options.codex,
      question,
      { schema: SONG_ANSWER_SCHEMA, parse: parseSongAnswer, notJson: 'song id answer is not json' },
      this.options.log,
    );
    if (!answer) return { answer, text };
    this.options.log.info('song identified', {
      title: answer.title,
      artist: answer.artist,
      sure: answer.sure,
    });
    return { answer, text };
  }

  /** When `title` was last told to the room (by /识歌 or on its own), if it was. */
  namedAt(title: string): number | undefined {
    return this.named.get(title);
  }

  /** The last song told to the room (by /识歌 or on its own), and when; undefined for none yet. */
  lastTold(): { song: SongAnswer; at: number } | undefined {
    return this.last;
  }

  /** Remembers that `song` was told to the room now (when it's sure of it), and says so. */
  told(song: SongAnswer): void {
    if (!song.title || !song.sure) return;
    const at = (this.options.now ?? Date.now)();
    this.named.set(song.title, at);
    this.last = { song, at };
    this.options.onTold?.(song);
  }

  /** `/识歌`, for anyone at a mention's price. */
  commands(): Command[] {
    return [
      {
        name: '识歌',
        adminOnly: false,
        prompt: () => this.prompt(),
        // Only the song being sung now, not the one before it.
        pickTranscript: (lines) => (this.picked = currentSong(lines)),
        ask: (question) => this.identify(question),
      },
    ];
  }

  /**
   * `/识歌`'s answer: the message the model wrote, or its whole answer when that isn't JSON; with
   * too little sung yet (see `early`), what that says, without asking.
   */
  private async identify(question: Question): Promise<string> {
    const { early, log } = this.options;
    const chars = sungChars(this.picked);
    if (early && chars < early.minChars) {
      log.info('song id: too little sung yet', { chars });
      if (!chars) return early.noLyrics();
      const heard = this.picked
        .filter(isSung)
        .slice(-2)
        .map((line) => line.text)
        .join('」「');
      return early.tooEarly(heard);
    }
    const { answer, text } = await this.name(question, { why: 'command', lines: this.picked });
    if (!answer) return text;
    this.told(answer);
    return answer.message;
  }
}
