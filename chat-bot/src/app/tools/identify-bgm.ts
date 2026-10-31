import { errorMessage } from '../../core/errors';
import type { MusicMatch } from '../../core/songs/music';
import type { Log } from '../ports';
import type { BotTool } from '../../core/tools/bot-tool';

/**
 * `identify_bgm`: the music playing in the stream's background, by its audio fingerprint, for
 * Claude to say in its own words; `/识别背景音乐` calls it directly and says what it found.
 */
export function identifyBgmTool(identify: () => Promise<MusicMatch | null>, log: Log): BotTool {
  return {
    name: 'identify_bgm',
    commands: [
      {
        name: '识别背景音乐',
        parse: () => ({ args: {} }),
        say: (result) => {
          const match = JSON.parse(result.text) as {
            found: boolean;
            title?: string;
            artist?: string;
          };
          if (!match.found) return '我找不到';
          return `现在放的是${match.artist ? `${match.artist}的` : ''}《${match.title}》`;
        },
      },
    ],
    description:
      '认直播间现在放的背景音乐（录音、伴奏，不是主播自己唱的）。观众想知道在放什么音乐时调用；主播自己在唱的用 identify_song。',
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
        return { text: '现在识别不了背景音乐，请稍后再试', isError: true };
      }
    },
  };
}
