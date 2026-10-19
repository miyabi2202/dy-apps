import { parseSongAnswer, SONG_ANSWER_SCHEMA, type SongAnswer } from '../core/song-answer';
import type { Command } from './command';
import { currentSong } from '../core/transcript';
import type { AskClaude, Log, Question } from './ports';

export interface SongIdOptions {
  /** The prompt (see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  /** Codex, which searches the web live (Google among others), so it finds lyrics. */
  codex: AskClaude;
  log: Log;
  now?: () => number;
  /** Told each song named to the room, after its message, to say more about it. */
  onTold?: (song: SongAnswer) => void;
}

/**
 * Names the song being sung, for `/识歌` and /自动识歌: Codex searches for the lyrics of the
 * current song, with the prompt, and answers in SONG_ANSWER_SCHEMA's shape.
 */
export class SongId {
  /** When each song it named was last named, by title. */
  private readonly named = new Map<string, number>();

  constructor(private readonly options: SongIdOptions) {}

  prompt(): string {
    return this.options.prompt();
  }

  /**
   * Asks Codex to name the song, for an answer in SONG_ANSWER_SCHEMA's shape, logged; null when
   * the answer isn't that shape, with the text it was.
   */
  async name(question: Question): Promise<{ answer: SongAnswer | null; text: string }> {
    const text = await this.options.codex({ ...question, schema: SONG_ANSWER_SCHEMA });
    const answer = parseSongAnswer(text);
    if (!answer) {
      this.options.log.warn('song id answer is not json', { text });
      return { answer, text };
    }
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

  /** Remembers that `song` was told to the room now (when it's sure of it), and says so. */
  told(song: SongAnswer): void {
    if (!song.title || !song.sure) return;
    this.named.set(song.title, (this.options.now ?? Date.now)());
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
        pickTranscript: (lines) => currentSong(lines),
        ask: (question) => this.identify(question),
      },
    ];
  }

  /** `/识歌`'s answer: the message the model wrote, or its whole answer when that isn't JSON. */
  private async identify(question: Question): Promise<string> {
    const { answer, text } = await this.name(question);
    if (!answer) return text;
    this.told(answer);
    return answer.message;
  }
}
