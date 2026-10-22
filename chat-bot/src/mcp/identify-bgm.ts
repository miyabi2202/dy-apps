import { errorMessage } from '../core/errors';
import type { MusicMatch } from '../core/music';
import type { Log } from '../app/ports';
import type { BotTool } from './rpc';

/**
 * `identify_bgm`: the music playing in the stream's background, by its audio fingerprint (what
 * `/识别背景音乐` does), for Claude to say in its own words.
 */
export function identifyBgmTool(identify: () => Promise<MusicMatch | null>, log: Log): BotTool {
  return {
    name: 'identify_bgm',
    command: '识别背景音乐',
    description:
      '认直播间现在放的背景音乐（录音、伴奏，不是主播自己唱的）。观众想知道在放什么音乐时调用。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      try {
        const match = await identify();
        return {
          text: JSON.stringify(
            match ? { found: true, title: match.title, artist: match.artist } : { found: false },
          ),
        };
      } catch (err) {
        log.warn('could not identify the music', { error: errorMessage(err) });
        return { text: '现在识别不了背景音乐', isError: true };
      }
    },
  };
}
