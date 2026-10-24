import type { BotTool, Log } from '../app/ports';
import type { RoomState } from '../app/room/room-state';
import type { SongId } from '../app/songs/song-id';
import { currentSong } from '../core/songs/transcript';

export interface IdentifySongOptions {
  songId: Pick<SongId, 'prompt' | 'identifyLines' | 'told' | 'lastTold'>;
  room: Pick<RoomState, 'recentTranscript' | 'prompt' | 'now' | 'songSpans'>;
  /** Douyin's chat length limit, which the song prompt asks its message to fit. */
  maxLength: number;
  log: Log;
}

/** What 「这是什么歌」 is in all its forms, as Jev judges each new line; auto-reply looks at once for the trigger. */
const WHAT_SONG_WHEN =
  '在问现在正在唱的或者正在放的是什么歌：歌名、谁唱的、哪里的歌，比如「这是什么歌」「啥歌」「这首叫什么」「求歌名」「bgm 是什么」「背景音乐叫啥」「在放什么」；常省略主语，也常有错别字。问主播会不会唱某首歌、想点歌、问以前唱过什么，都不算；刚刚已经有人（包括机器人）说了这首的歌名，再问同一首也不算';
const WHAT_SONG_TRIGGER =
  /(?<![唱点啥么])(什么|啥)(歌|曲)(?![歌曲])|这首叫|这歌叫|叫(什么|啥)歌(?!歌)|(在|正在)放(的是)?(什么|啥)(?!(什么|啥))|放的(是)?(什么|啥)(?!(什么|啥))|(歌名|[bB][gG][mM]|背景音乐)(是|叫)?(什么|啥)|求(个|一下)?(歌名|[bB][gG][mM])/;

/**
 * `identify_song`: what the streamer is singing now (the lyrics search, then Codex when it isn't
 * sure), for Claude to say in its own words. The song it named is remembered as told, so
 * /自动识歌 doesn't say it again; it has no intro of its own, as Claude's reply is the intro, unless
 * a typed `/识歌` called it (`direct`), which has no reply of Claude's and so gets the intro as
 * usual. It also says which song the room was last told, so Claude can tell "still that one".
 */
export function identifySongTool({ songId, room, maxLength, log }: IdentifySongOptions): BotTool {
  return {
    name: 'identify_song',
    description:
      '认主播现在唱的歌（按最近的歌词）。观众想知道现在唱的、放的是什么歌时调用：主播最近的话里有标（唱）的歌词、是主播自己在唱，用这个；放的是录音、伴奏、没人在唱，用 identify_bgm。hint 是观众给的提示（可空）。没给 artist 就只知道歌名，别自己猜原唱。othersSang 为 true 时，这段歌词大多不像主播的声音（可能是连线在唱、在放录音，也可能只是认错了声音），说的时候带一句问问，别说成主播在唱。message 是程序写好的一句，你可以不用。',
    inputSchema: {
      type: 'object',
      properties: {
        hint: { type: 'string', description: '观众给的提示，比如「是不是周杰伦的」；没有就不填' },
      },
    },
    listen: { when: WHAT_SONG_WHEN, trigger: WHAT_SONG_TRIGGER },
    commands: [
      {
        name: '识歌',
        parse: (args) => ({ args: args ? { hint: args } : {} }),
        say: (result) => (JSON.parse(result.text) as { message: string }).message,
      },
    ],
    async call(args, { asker, direct }) {
      const hint = typeof args.hint === 'string' ? args.hint : '';
      const transcript = room.recentTranscript();
      const lines = currentSong(transcript, { spans: room.songSpans(transcript) });
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
      const outcome = await songId.identifyLines({ prompt }, lines, direct ? 'command' : 'tool');
      if (outcome.kind === 'early') {
        return {
          text: JSON.stringify({
            found: false,
            note: outcome.text,
            message: outcome.text,
            lastTold,
          }),
        };
      }
      const { answer, by, othersSang } = outcome;
      if (!answer?.title) {
        log.info('identify_song found nothing', { by });
        return {
          text: JSON.stringify({
            found: false,
            by,
            message: outcome.answer?.message ?? outcome.text,
            lastTold,
          }),
        };
      }
      songId.told(answer, { introduce: direct === true });
      return {
        text: JSON.stringify({
          found: true,
          title: answer.title,
          artist: answer.artist,
          sure: answer.sure,
          message: answer.message,
          by,
          ...(othersSang && { othersSang }),
          lastTold,
        }),
      };
    },
  };
}
