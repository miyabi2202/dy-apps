import { candidates, clearWinner, lyricFragments } from '../core/lyrics';
import { done, failed, type Command, type Prepared } from './command';
import type { AskClaude, Log, LyricsSearch } from './ports';

/** Who looks a song up when the lyrics site alone can't tell, the first there is by default. */
export const SONG_ID_ENGINES = ['codex', 'claude'] as const;
export type SongIdEngine = (typeof SONG_ID_ENGINES)[number];

export interface SongIdOptions {
  /** Claude's prompt (see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  /** Codex's, which searches with Google rather than fetch lyrics pages. */
  webPrompt?: () => string;
  /** Searches a lyrics site with a fragment of the lyrics. */
  search?: LyricsSearch;
  /** What the streamer sang lately, oldest first. */
  sungLines: () => string[];
  /** Claude, with web search and fetch. */
  claude: AskClaude;
  /** Codex, which searches the web live (Google among others). */
  codex?: AskClaude;
  log: Log;
}

/** At most this many of Claude's turns: a lookup that runs longer is given up on (and refunded). */
export const SONG_ID_MAX_TURNS = 12;

/**
 * Names the song being sung, for `/识歌`. First the bot itself searches a lyrics site with
 * fragments of the last lines sung: when they all point at one song, it answers with it at once.
 * Otherwise Codex (which searches with Google, so it finds lyrics Claude's web search doesn't)
 * or Claude (web search and fetch only, at most SONG_ID_MAX_TURNS turns) works it out
 * with the prompt, told what the search found (`{{lookup}}`): the first of them there is, until
 * an admin switches with `/识歌模型`.
 */
export class SongId {
  engine: SongIdEngine;

  constructor(private readonly options: SongIdOptions) {
    this.engine = SONG_ID_ENGINES.find((engine) => options[engine]) ?? 'claude';
  }

  /** `/识歌` for anyone, at a mention's price; `/识歌模型 codex|claude` for admins. */
  commands(): Command[] {
    const { prompt, webPrompt = prompt, claude, log } = this.options;
    return [
      {
        name: '识歌',
        adminOnly: false,
        prompt: () => (this.engine === 'claude' ? prompt() : webPrompt()),
        prepare: () => this.lookUpLyrics(),
        tools: ['WebSearch', 'WebFetch'],
        maxTurns: SONG_ID_MAX_TURNS,
        ask: (question) => (this.options[this.engine] ?? claude)(question),
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

  private async lookUpLyrics(): Promise<Prepared> {
    const { search, sungLines, log } = this.options;
    const fragments = lyricFragments(sungLines());
    if (!search || !fragments.length) return null;
    const found = await Promise.all(
      fragments.map((fragment) =>
        search(fragment).catch((err: unknown) => {
          log.warn('lyrics search failed', { fragment, error: String(err) });
          return [];
        }),
      ),
    );
    const songs = candidates(found);
    const winner = clearWinner(songs);
    log.info('lyrics search', {
      fragments: fragments.length,
      top: songs.slice(0, 3).map((s) => `${s.artist}《${s.title}》×${s.fragments}`),
      winner: !!winner,
    });
    if (winner) return { answer: `这首是${winner.artist}的《${winner.title}》` };
    if (!songs.length) {
      return { lookup: `用 ${fragments.length} 个歌词片段查了 j-lyric，都没有结果。` };
    }
    return {
      lookup: [
        `用 ${fragments.length} 个歌词片段查了 j-lyric，命中的歌（括号里是命中的片段数，越多越可能）：`,
        ...songs.slice(0, 5).map((s) => `- ${s.artist}《${s.title}》（${s.fragments}）${s.url}`),
      ].join('\n'),
    };
  }
}
