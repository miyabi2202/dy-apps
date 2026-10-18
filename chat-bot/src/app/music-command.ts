import { errorMessage } from '../core/errors';
import type { MusicMatch } from '../core/music';
import { done, failed, type Command } from './command';
import type { Log } from './ports';

/**
 * `/识别背景音乐`: names the music playing in the stream from its last 15 s of audio, by its
 * fingerprint (see Transcriber.identifyMusic), so it finds the original recording playing in the
 * background even under the streamer's talk. For anyone, at a mention's price, refunded when
 * nothing is found. `/识歌` is the one for what the streamer sings themselves.
 */
export function musicCommand(identify: () => Promise<MusicMatch | null>, log: Log): Command {
  return {
    name: '识别背景音乐',
    adminOnly: false,
    run: async () => {
      try {
        const match = await identify();
        if (!match) {
          return failed('我找不到');
        }
        const artist = match.artist ? `${match.artist}的` : '';
        return done(`现在放的是${artist}《${match.title}》`);
      } catch (err) {
        log.warn('could not identify the music', { error: errorMessage(err) });
        return failed('现在识别不了背景音乐，请稍后再试');
      }
    },
  };
}
