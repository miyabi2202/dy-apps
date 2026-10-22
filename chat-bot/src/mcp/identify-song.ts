import type { Log } from '../app/ports';
import type { RoomState } from '../app/room-state';
import type { SongId } from '../app/song-id';
import { currentSong } from '../core/transcript';
import type { BotTool } from './rpc';

export interface IdentifySongOptions {
  songId: Pick<SongId, 'prompt' | 'identifyLines' | 'told' | 'lastTold'>;
  room: Pick<RoomState, 'recentTranscript' | 'prompt' | 'now'>;
  /** Douyin's chat length limit, which the song prompt asks its message to fit. */
  maxLength: number;
  log: Log;
}

/**
 * `identify_song`: what the streamer is singing now, found the way `/识歌` finds it (the lyrics
 * search, then Codex when it isn't sure), for Claude to say in its own words. The song it named is
 * remembered as told, so /自动识歌 doesn't say it again, but with no intro of its own: Claude's
 * reply is the intro. It also says which song the room was last told, so Claude can tell "still
 * that one".
 */
export function identifySongTool({ songId, room, maxLength, log }: IdentifySongOptions): BotTool {
  return {
    name: 'identify_song',
    command: '识歌',
    description:
      '认主播现在唱的歌（按最近的歌词）。观众想知道主播在唱什么歌时调用；hint 是观众给的提示（可空）。没给 artist 就只知道歌名，别自己猜原唱。',
    inputSchema: {
      type: 'object',
      properties: {
        hint: { type: 'string', description: '观众给的提示，比如「是不是周杰伦的」；没有就不填' },
      },
    },
    async call(args, { asker }) {
      const hint = typeof args.hint === 'string' ? args.hint : '';
      const lines = currentSong(room.recentTranscript());
      const prompt = room.prompt(songId.prompt(), {
        transcript: lines,
        asker,
        question: hint,
        singleLength: maxLength,
        maxLength,
      });
      // Read before this call's own song is remembered.
      const last = songId.lastTold();
      const lastTold = last && {
        title: last.song.title,
        artist: last.song.artist,
        minutesAgo: Math.round((room.now() - last.at) / 60_000),
      };
      const outcome = await songId.identifyLines({ prompt }, lines, 'tool');
      if (outcome.kind === 'early') {
        return { text: JSON.stringify({ found: false, note: outcome.text, lastTold }) };
      }
      const { answer, by } = outcome;
      if (!answer?.title) {
        log.info('identify_song found nothing', { by });
        return { text: JSON.stringify({ found: false, by, lastTold }) };
      }
      songId.told(answer, { introduce: false });
      return {
        text: JSON.stringify({
          found: true,
          title: answer.title,
          artist: answer.artist,
          sure: answer.sure,
          by,
          lastTold,
        }),
      };
    },
  };
}
