import { parseJsonObject } from '../replies/json-answer';

/** What the model says when a song was named: the one message that tells the room the song. */
export interface SongIntroAnswer {
  message: string;
}

/** The JSON Schema SongIntroAnswer follows (strict: every field required, no others). */
export const SONG_INTRO_SCHEMA = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description: '要发到直播间的那条弹幕，里面要有《歌名》',
    },
  },
  required: ['message'],
  additionalProperties: false,
} as const;

/** `text` as a SongIntroAnswer, or null when it isn't one (the model ignored the schema). */
export function parseSongIntro(text: string): SongIntroAnswer | null {
  const message = parseJsonObject(text)?.message;
  return typeof message === 'string' ? { message } : null;
}
