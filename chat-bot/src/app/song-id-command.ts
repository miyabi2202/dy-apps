import { parseSongAnswer, SONG_ANSWER_SCHEMA, type SongAnswer } from '../core/song-answer';
import { done, failed, type Command } from './command';
import { currentSong } from '../core/transcript';
import type { AskClaude, Log, Question } from './ports';

/** Who looks a song up when the lyrics site alone can't tell, the first there is by default. */
export const SONG_ID_ENGINES = ['codex', 'claude'] as const;
export type SongIdEngine = (typeof SONG_ID_ENGINES)[number];

export interface SongIdOptions {
  /** Claude's prompt (see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  /** Codex's, which searches with Google rather than fetch lyrics pages. */
  webPrompt?: () => string;
  /** Claude, with web search and fetch. */
  claude: AskClaude;
  /** Codex, which searches the web live (Google among others). */
  codex?: AskClaude;
  log: Log;
  now?: () => number;
}

/** At most this many of Claude's turns: a search that runs longer is given up on (and refunded). */
export const SONG_ID_MAX_TURNS = 12;

/**
 * Names the song being sung, for `/识歌`: Codex (which searches with Google, so it finds lyrics
 * Claude's web search doesn't) or Claude (web search and fetch only, at most SONG_ID_MAX_TURNS
 * turns) works it out from the lyrics of the current song, with the prompt: the first of them
 * there is, until an admin switches with `/识歌模型`.
 */
export class SongId {
  engine: SongIdEngine;
  /** When each song it named was last named, by title. */
  private readonly named = new Map<string, number>();

  constructor(private readonly options: SongIdOptions) {
    this.engine = SONG_ID_ENGINES.find((engine) => options[engine]) ?? 'claude';
  }

  /** The current model's prompt. */
  prompt(): string {
    const { prompt, webPrompt = prompt } = this.options;
    return this.engine === 'claude' ? prompt() : webPrompt();
  }

  /**
   * Asks the current model to name the song (with web search, at most SONG_ID_MAX_TURNS turns),
   * for an answer in SONG_ANSWER_SCHEMA's shape, logged; null when the answer isn't that shape,
   * with the text it was.
   */
  async name(question: Question): Promise<{ answer: SongAnswer | null; text: string }> {
    const { engine } = this;
    const model = this.options[engine] ?? this.options.claude;
    const text = await model({
      tools: ['WebSearch', 'WebFetch'],
      maxTurns: SONG_ID_MAX_TURNS,
      ...question,
      schema: SONG_ANSWER_SCHEMA,
    });
    const answer = parseSongAnswer(text);
    if (!answer) {
      this.options.log.warn('song id answer is not json', { engine, text });
      return { answer, text };
    }
    this.options.log.info('song identified', {
      engine,
      title: answer.title,
      artist: answer.artist,
    });
    return { answer, text };
  }

  /** When `title` was last told to the room (by /识歌 or on its own), if it was. */
  namedAt(title: string): number | undefined {
    return this.named.get(title);
  }

  /** Remembers that `title` was told to the room now. */
  told(title: string): void {
    if (title) this.named.set(title, (this.options.now ?? Date.now)());
  }

  /** `/识歌` for anyone, at a mention's price; `/识歌模型 codex|claude` for admins. */
  commands(): Command[] {
    const { log } = this.options;
    return [
      {
        name: '识歌',
        adminOnly: false,
        prompt: () => this.prompt(),
        // Only the song being sung now, not the one before it.
        pickTranscript: (lines) => currentSong(lines),
        tools: ['WebSearch', 'WebFetch'],
        maxTurns: SONG_ID_MAX_TURNS,
        ask: (question) => this.identify(question),
      },
      {
        name: '识歌模型',
        adminOnly: true,
        price: 0,
        run: (args) => {
          const engine = SONG_ID_ENGINES.find((e) => e === args.toLowerCase());
          if (!engine) return failed('要写 codex 或 claude，用法：/识歌模型 codex');
          if (!this.options[engine]) {
            const usable = SONG_ID_ENGINES.filter((e) => this.options[e]).join('、');
            return failed(`没有装 ${engine}，可以用的有：${usable}`);
          }
          this.engine = engine;
          log.info('song id engine', { engine });
          return done('已处理识歌模型请求');
        },
      },
    ];
  }

  /** `/识歌`'s answer: the message the model wrote, or its whole answer when that isn't JSON. */
  private async identify(question: Question): Promise<string> {
    const { answer, text } = await this.name(question);
    if (!answer) return text;
    this.told(answer.title);
    return answer.message;
  }
}
