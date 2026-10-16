import type { ChatLine } from './chat-history';
import type { TranscriptLine } from './transcript';

export interface PromptInput {
  /** Recent chat before the question, oldest first. */
  history: readonly ChatLine[];
  /** What the streamer said lately, oldest first. */
  transcript: readonly TranscriptLine[];
  asker: string;
  question: string;
  /** How many characters the answer may use. */
  maxLength: number;
  /** The current time, ms since the epoch. */
  now: number;
}

/** `HH:MM:SS` in the machine's time zone. */
export function clock(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 8);
}

/**
 * Fills a prompt template: `{{history}}` becomes one `昵称: 内容` line per chat, `{{transcript}}`
 * one `HH:MM:SS 内容` line per sentence the streamer said, `{{asker}}` and `{{question}}` the
 * mention's sender and text, `{{maxLength}}` the answer's length limit, and `{{now}}` the time.
 */
export function buildPrompt(template: string, input: PromptInput): string {
  const { history, transcript, asker, question, maxLength, now } = input;
  const values: Record<string, string> = {
    history: history.map((line) => `${line.nickname}: ${line.content}`).join('\n') || '（暂无）',
    transcript:
      transcript.map((line) => `${clock(line.start)} ${line.text}`).join('\n') || '（暂无）',
    asker,
    question: question || '（只 @ 了你，没有说别的）',
    maxLength: String(maxLength),
    now: clock(now),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}
