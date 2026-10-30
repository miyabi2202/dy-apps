import { parseJsonObject } from './json-answer';

/** What Claude answers a mention (or something said to it) with, from prompt.md. */
export interface MentionAnswer {
  /** The reply to send. */
  message: string;
  /** Whether it goes with an @ of the asker; false when it's plain whom it answers. True when Claude didn't say. */
  at: boolean;
}

/**
 * Just the reply, for `ask_about_puzzle`'s answer: so what the model says while it works, or the
 * sources it lists after a web search, aren't sent with it.
 */
export const MESSAGE_SCHEMA = {
  type: 'object',
  properties: { message: { type: 'string', description: '要发到直播间的回复' } },
  required: ['message'],
  additionalProperties: false,
} as const;

/** Messages to others than the asker, each sent as its own `@to message`. */
const OTHERS = {
  type: 'array',
  description: '要 @ 的其他人，每人一条；没有就是空数组',
  items: {
    type: 'object',
    properties: {
      to: { type: 'string', description: '对方的昵称，不带 @' },
      message: { type: 'string', description: '发给他的话，不要在开头写他的名字' },
    },
    required: ['to', 'message'],
    additionalProperties: false,
  },
} as const;

/** One message to someone other than the asker, from MENTION_ANSWER_SCHEMA's `others`. */
export interface OtherMessage {
  to: string;
  message: string;
}

/** MENTION_ANSWER_SCHEMA's `others` in `text`, those with a name and something to say; [] for none. */
export function parseOthers(text: string): OtherMessage[] {
  const others = parseJsonObject(text)?.others;
  if (!Array.isArray(others)) return [];
  return others.flatMap((other: unknown) => {
    if (typeof other !== 'object' || other === null) return [];
    const { to, message } = other as Record<string, unknown>;
    if (typeof to !== 'string' || typeof message !== 'string') return [];
    const name = to.trim().replace(/^@/, '').trim();
    return name && message.trim() ? [{ to: name, message }] : [];
  });
}

/**
 * The JSON Schema MentionAnswer follows (strict: every field required, no others), with `at`, whether
 * the reply @s the asker, and `others` for when they ask the bot to say something to someone else.
 */
export const MENTION_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string', description: '回给提问的人的话，不用回就是空字符串' },
    at: {
      type: 'boolean',
      description:
        '这条回复要不要 @ 提问的人：一看就知道在回谁（TA 刚说完、没别人插话）就 false，不然 true',
    },
    others: OTHERS,
  },
  required: ['message', 'at', 'others'],
  additionalProperties: false,
} as const;

/**
 * `text` as a MentionAnswer; an answer that isn't the schema's JSON (the model ignored it) is
 * taken as the message itself.
 */
export function parseMentionAnswer(text: string): MentionAnswer {
  const json = parseJsonObject(text);
  const message = json?.message;
  return {
    message: typeof message === 'string' ? message : text,
    at: json?.at !== false,
  };
}
