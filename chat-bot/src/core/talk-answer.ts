import { parseJsonObject } from './json-answer';

/** What the model answers when the bot may talk unprompted: whether to, and what. */
export interface TalkAnswer {
  /** False when there's no need to say anything (someone answered already, the talk moved on). */
  reply: boolean;
  /** The message to send; empty when not replying. */
  message: string;
}

/** The JSON Schema TalkAnswer follows (strict: every field required, no others). */
export const TALK_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'boolean', description: '要不要发这条弹幕' },
    message: { type: 'string', description: '要发到直播间的那条弹幕，不发就是空字符串' },
  },
  required: ['reply', 'message'],
  additionalProperties: false,
} as const;

/** `text` as a TalkAnswer, or null when it isn't one (the model ignored the schema). */
export function parseTalkAnswer(text: string): TalkAnswer | null {
  const answer = parseJsonObject(text);
  if (!answer) return null;
  const { reply, message } = answer;
  if (typeof reply !== 'boolean' || typeof message !== 'string') return null;
  return { reply, message };
}
