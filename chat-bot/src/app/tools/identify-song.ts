import type { Log } from '../ports';
import type { BotTool } from '../../core/tools/bot-tool';
import type { RoomState } from '../room/room-state';
import type { SongId } from '../songs/song-id';
import type { SongSpans } from '../songs/song-spans';
import { currentSong } from '../../core/songs/transcript';

export interface IdentifySongOptions {
  songId: Pick<SongId, 'prompt' | 'identifyLines' | 'told' | 'lastTold'>;
  room: Pick<RoomState, 'recentTranscript' | 'prompt' | 'now'>;
  /** Where the songs in the transcript begin and end. */
  songSpans: Pick<SongSpans, 'of'>;
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
 * `identify_song`: what the streamer is singing now (Shazam, then the lyrics search, then Codex when
 * they aren't sure), for Claude to say in its own words. The song it named is remembered as told, so
 * /自动识歌 doesn't say it again. A typed `/识歌` (`direct`) has no reply of Claude's, so Codex
 * writes its message to the room even for a song Shazam or the lyrics search named; for Claude it
 * doesn't, as Claude's reply is the message. It also says which song the room was last told, so
 * Claude can tell "still that one".
 */
export function identifySongTool({
  songId,
  room,
  songSpans,
  maxLength,
  log,
}: IdentifySongOptions): BotTool {
  return {
    name: 'identify_song',
    description:
      '认主播现在唱的歌（按最近的歌词）。观众想知道现在唱的、放的是什么歌时调用：主播最近的话里有标（唱）的歌词、是主播自己在唱，用这个；放的是录音、伴奏、没人在唱，用 identify_bgm。hint 是观众给的提示（可空）。没给 artist 就只知道歌名，别自己猜原唱。othersSang 为 true 时，这段歌词大多不像主播的声音（可能是连线在唱、在放录音，也可能只是认错了声音），说的时候带一句问问，别说成主播在唱。singer 是按唱之前说的话和弹幕看出的谁在唱：streamer 主播自己，guest 连线的人（别说成主播在唱，这时不用管 othersSang），unsure 看不出来。message 是程序写好的一句，你可以不用。found 为 false（歌词太少、没认出来）时，只说现在还认不出、请对方过会儿再问，别说你会等着、过会儿自己报：你不会自己回头再认。',
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
    async call(args, { asker, direct, unasked }) {
      const hint = typeof args.hint === 'string' ? args.hint : '';
      const transcript = room.recentTranscript();
      const lines = currentSong(transcript, { spans: songSpans.of(transcript) });
      // The whole recent transcript, for who is singing it (see AutoSongId's buildPrompt).
      const prompt = room.prompt(songId.prompt(), {
        transcript,
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
      // Not asked, and it doesn't know (too little sung, nothing found, a guess): nothing to say
      // (see ToolContext's `unasked`).
      const silent = (found: object) => {
        log.info('identify_song: not sure, unasked: silent');
        return { text: JSON.stringify(found), silent: true as const };
      };
      if (outcome.kind === 'early') {
        if (unasked) return silent({ found: false });
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
      if (unasked && !answer?.sure) return silent({ found: false, by });
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
      songId.told(answer);
      return {
        text: JSON.stringify({
          found: true,
          title: answer.title,
          artist: answer.artist,
          sure: answer.sure,
          message: answer.message,
          by,
          ...(othersSang && { othersSang }),
          ...(answer.singer && { singer: answer.singer }),
          lastTold,
        }),
      };
    },
  };
}
