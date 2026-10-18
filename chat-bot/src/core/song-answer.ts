/** What a model answers `/识歌` with: the message to send, and the song when it named one. */
export interface SongAnswer {
  message: string;
  /** Empty when it didn't name a song. */
  title: string;
  artist: string;
}

/** The JSON Schema SongAnswer follows (strict: every field required, no others). */
export const SONG_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string', description: '要发到直播间的那条弹幕' },
    title: { type: 'string', description: '认出的歌名，没认出来就是空字符串' },
    artist: { type: 'string', description: '原唱，不知道就是空字符串' },
  },
  required: ['message', 'title', 'artist'],
  additionalProperties: false,
} as const;

/** `text` as a SongAnswer, or null when it isn't one (the model ignored the schema). */
export function parseSongAnswer(text: string): SongAnswer | null {
  let answer: Partial<Record<keyof SongAnswer, unknown>>;
  try {
    answer = JSON.parse(text) as typeof answer;
  } catch {
    return null;
  }
  const { message, title = '', artist = '' } = answer ?? {};
  if (typeof message !== 'string' || typeof title !== 'string' || typeof artist !== 'string') {
    return null;
  }
  return { message, title, artist };
}
