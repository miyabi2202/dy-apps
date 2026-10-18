import { parseSongAnswer, SONG_ANSWER_SCHEMA } from '../core/song-answer';
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

  constructor(private readonly options: SongIdOptions) {
    this.engine = SONG_ID_ENGINES.find((engine) => options[engine]) ?? 'claude';
  }

  /** `/识歌` for anyone, at a mention's price; `/识歌模型 codex|claude` for admins. */
  commands(): Command[] {
    const { prompt, webPrompt = prompt, log } = this.options;
    return [
      {
        name: '识歌',
        adminOnly: false,
        prompt: () => (this.engine === 'claude' ? prompt() : webPrompt()),
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

  /**
   * Asks the current model, for an answer in SONG_ANSWER_SCHEMA's shape: its message is what's
   * sent, and the song it named is logged. An answer that isn't that shape is sent as it is.
   */
  private async identify(question: Question): Promise<string> {
    const model = this.options[this.engine] ?? this.options.claude;
    const text = await model({ ...question, schema: SONG_ANSWER_SCHEMA });
    const answer = parseSongAnswer(text);
    if (!answer) {
      this.options.log.warn('song id answer is not json', { engine: this.engine, text });
      return text;
    }
    this.options.log.info('song identified', {
      engine: this.engine,
      title: answer.title,
      artist: answer.artist,
    });
    return answer.message;
  }
}
