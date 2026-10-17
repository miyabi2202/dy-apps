import { clock } from './local-time';
import type { ChatLine } from './room-events';
import type { TranscriptLine } from './transcript';

export interface PromptInput {
  /** Recent chat before the question, oldest first. */
  history: readonly ChatLine[];
  /** What the streamer said lately, oldest first. */
  transcript: readonly TranscriptLine[];
  asker: string;
  question: string;
  /** How many characters fit in one message. */
  singleLength: number;
  /** How many characters the answer may use at most, over several messages. */
  maxLength: number;
  /** The current time, ms since the epoch. */
  now: number;
  /** The folder of the room's chat record files. */
  chatDir?: string;
  /** Who the bot plays, as admins set it. */
  persona?: string;
}

/**
 * Fills a prompt template: `{{history}}` becomes one `昵称: 内容` line per chat, `{{transcript}}`
 * one `HH:MM:SS 内容` line per sentence the streamer said, `{{asker}}` and `{{question}}` the
 * mention's sender and text, `{{singleLength}}` what fits in one message and `{{maxLength}}` the
 * most the answer may use over several, `{{now}}` the time, `{{chatDir}}` the folder of chat
 * record files, and `{{persona}}` the line `你的人设是…` (empty without a persona).
 */
export function buildPrompt(template: string, input: PromptInput): string {
  const { history, transcript, asker, question, singleLength, maxLength, now, chatDir, persona } =
    input;
  const values: Record<string, string> = {
    history: history.map((line) => `${line.nickname}: ${line.content}`).join('\n') || '（暂无）',
    transcript:
      transcript.map((line) => `${clock(line.start)} ${line.text}`).join('\n') || '（暂无）',
    asker,
    question: question || '（只 @ 了你，没有说别的）',
    singleLength: String(singleLength),
    maxLength: String(maxLength),
    now: clock(now),
    chatDir: chatDir ?? '（无）',
    persona: persona ? `你的人设是${persona}` : '',
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}
