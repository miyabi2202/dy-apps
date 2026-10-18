import { candidates, clearWinner, lyricFragments } from '../core/lyrics';
import type { Command, Prepared } from './command';
import type { Log, LyricsSearch } from './ports';

export interface SongIdOptions {
  /** Searches a lyrics site with a fragment of the lyrics. */
  search?: LyricsSearch;
  /** What the streamer sang lately, oldest first. */
  sungLines: () => string[];
  log: Log;
}

/** At most this many of Claude's turns: a lookup that runs longer is given up on (and refunded). */
export const SONG_ID_MAX_TURNS = 12;

/**
 * `/识歌`: anyone can ask, at a mention's price. First the bot itself searches a lyrics site
 * with fragments of the last lines sung: when they all point at one song, it answers with it at
 * once, without Claude. Otherwise Claude works it out with `prompt` (see buildPrompt), told what
 * the search found (`{{lookup}}`), with web search and fetch only, for at most
 * SONG_ID_MAX_TURNS turns.
 */
export function songIdCommand(prompt: () => string, options: SongIdOptions): Command {
  return {
    name: '识歌',
    adminOnly: false,
    prompt,
    prepare: () => lookUpLyrics(options),
    tools: ['WebSearch', 'WebFetch'],
    maxTurns: SONG_ID_MAX_TURNS,
  };
}

async function lookUpLyrics({ search, sungLines, log }: SongIdOptions): Promise<Prepared> {
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
  if (!songs.length)
    return { lookup: `用 ${fragments.length} 个歌词片段查了 j-lyric，都没有结果。` };
  return {
    lookup: [
      `用 ${fragments.length} 个歌词片段查了 j-lyric，命中的歌（括号里是命中的片段数，越多越可能）：`,
      ...songs.slice(0, 5).map((s) => `- ${s.artist}《${s.title}》（${s.fragments}）${s.url}`),
    ].join('\n'),
  };
}
