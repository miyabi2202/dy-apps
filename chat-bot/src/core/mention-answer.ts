import { parseJsonObject } from './json-answer';

/** What Claude answers a mention (or something said to it) with, from prompt.md. */
export interface MentionAnswer {
  /** The reply to send. */
  message: string;
  /** A command they asked for in so many words (`修改人设`), without the slash; empty for none. */
  command: string;
  /** What goes after the command, as its usage says; empty for none. */
  args: string;
}

/** The JSON Schema MentionAnswer follows (strict: every field required, no others). */
export const MENTION_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string', description: '要发到直播间的回复' },
    command_request: {
      type: 'string',
      description:
        '对方要你做的事对应的指令名（不带 /），比如 修改人设；不是在要求调用指令就是空字符串',
    },
    command_args: {
      type: 'string',
      description: '指令后面要跟的内容，按指令说明的用法写，比如 100；没有就是空字符串',
    },
  },
  required: ['message', 'command_request', 'command_args'],
  additionalProperties: false,
} as const;

/**
 * `text` as a MentionAnswer; an answer that isn't the schema's JSON (the model ignored it) is
 * taken as the message itself.
 */
export function parseMentionAnswer(text: string): MentionAnswer {
  const answer = parseJsonObject(text);
  if (!answer) return { message: text, command: '', args: '' };
  const { message, command_request: command, command_args: args } = answer;
  if (typeof message !== 'string') return { message: text, command: '', args: '' };
  return {
    message,
    command: typeof command === 'string' ? command.trim().replace(/^\//, '') : '',
    args: typeof args === 'string' ? args.trim() : '',
  };
}
