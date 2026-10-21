import { recordStamp } from './local-time';

/** One @ and how the bot answered it. */
export interface Exchange {
  nickname: string;
  question: string;
  answer: string;
}

/** One line, `日期 时间+08:00 text` (in `timeZone`, the room's), with line breaks flattened. */
export function talkLine(ms: number, text: string, timeZone?: string): string {
  return `${recordStamp(ms, timeZone)} ${text.replace(/[\r\n]+/g, ' ')}\n`;
}

/** An exchange as two lines: `日期 时间 昵称问：…` and `日期 时间 你答：…`. */
export function exchangeLines(
  ms: number,
  { nickname, question, answer }: Exchange,
  timeZone?: string,
): string {
  return (
    talkLine(ms, `${nickname}问：${question}`, timeZone) + talkLine(ms, `你答：${answer}`, timeZone)
  );
}

/** The last `keep` lines of `text`, to keep prompts from growing without end. */
export function lastLines(text: string, keep: number): string {
  return text.trimEnd().split('\n').slice(-keep).join('\n');
}
