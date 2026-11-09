import { parseJsonObject } from '../replies/json-answer';

/** Who the model makes out to be singing: the streamer, the one she's linked up with (连线), or it can't tell. */
export type Singer = 'streamer' | 'guest' | 'unsure';

/** What a model answers `/识歌` with: the message to send, and the song when it named one. */
export interface SongAnswer {
  message: string;
  /** Empty when it didn't name a song. */
  title: string;
  artist: string;
  /** Whether it checked the lyrics and is sure; false for a guess (「听着像…不太确定」). */
  sure: boolean;
  /**
   * Who sang it, as the model made out from what was said before the song and the chat; unset
   * when no model wrote the answer (Shazam's or the lyrics search's plain message).
   */
  singer?: Singer;
  /** Most of what was sung of it was another voice's than the streamer's (see othersShare); set by the program, not the model. */
  othersSang?: boolean;
}

/** The JSON Schema SongAnswer follows (strict: every field required, no others). */
export const SONG_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string', description: '要发到直播间的那条弹幕' },
    title: { type: 'string', description: '认出的歌名，没认出来就是空字符串' },
    artist: { type: 'string', description: '原唱，不知道就是空字符串' },
    sure: {
      type: 'boolean',
      description: '找到歌词核对过、确定就是这首才是 true；猜的、不太确定、没认出来都是 false',
    },
    singer: {
      type: 'string',
      enum: ['streamer', 'guest', 'unsure'],
      description: '谁在唱：streamer 主播自己，guest 连线的人，unsure 看不出来',
    },
  },
  required: ['message', 'title', 'artist', 'sure', 'singer'],
  additionalProperties: false,
} as const;

/** `text` as a SongAnswer, or null when it isn't one (the model ignored the schema). */
export function parseSongAnswer(text: string): SongAnswer | null {
  const answer = parseJsonObject(text);
  if (!answer) return null;
  const { message, title = '', artist = '', sure = false, singer } = answer;
  if (typeof message !== 'string' || typeof title !== 'string' || typeof artist !== 'string') {
    return null;
  }
  return {
    message,
    title,
    artist,
    sure: sure === true && title !== '',
    singer: singer === 'streamer' || singer === 'guest' ? singer : 'unsure',
  };
}
