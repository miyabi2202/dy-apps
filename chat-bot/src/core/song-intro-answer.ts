/** What the model answers after a song was named: two messages, sent in this order. */
export interface SongIntroAnswer {
  /** About the song, from what it found; empty to say nothing. */
  intro: string;
  /** Praise for the streamer's singing; empty to say nothing. */
  praise: string;
}

/** The JSON Schema SongIntroAnswer follows (strict: every field required, no others). */
export const SONG_INTRO_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string', description: '介绍这首歌的那条弹幕，不发就是空字符串' },
    praise: { type: 'string', description: '夸主播唱得好的那条弹幕，不发就是空字符串' },
  },
  required: ['intro', 'praise'],
  additionalProperties: false,
} as const;

/** `text` as a SongIntroAnswer, or null when it isn't one (the model ignored the schema). */
export function parseSongIntro(text: string): SongIntroAnswer | null {
  let answer: Partial<Record<keyof SongIntroAnswer, unknown>>;
  try {
    answer = JSON.parse(text) as typeof answer;
  } catch {
    return null;
  }
  const { intro, praise } = answer ?? {};
  if (typeof intro !== 'string' || typeof praise !== 'string') return null;
  return { intro, praise };
}
