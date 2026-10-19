/** What the model says after a song was named: up to two messages, sent in order; none for nothing. */
export interface SongIntroAnswer {
  messages: string[];
}

/** The most messages it may say. */
export const SONG_INTRO_MAX = 2;

/** The JSON Schema SongIntroAnswer follows (strict: every field required, no others). */
export const SONG_INTRO_SCHEMA = {
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      items: { type: 'string' },
      maxItems: SONG_INTRO_MAX,
      description: '要发到直播间的弹幕，按顺序发；不说就是空数组',
    },
  },
  required: ['messages'],
  additionalProperties: false,
} as const;

/** `text` as a SongIntroAnswer, or null when it isn't one (the model ignored the schema). */
export function parseSongIntro(text: string): SongIntroAnswer | null {
  let answer: { messages?: unknown };
  try {
    answer = JSON.parse(text) as typeof answer;
  } catch {
    return null;
  }
  const messages = answer?.messages;
  if (!Array.isArray(messages) || !messages.every((m) => typeof m === 'string')) return null;
  return { messages: messages.slice(0, SONG_INTRO_MAX) };
}
