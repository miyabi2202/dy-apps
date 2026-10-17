import { localDateTime } from './local-time';

/** One @ and how the bot answered it. */
export interface Exchange {
  nickname: string;
  question: string;
  answer: string;
}

/** One line, `日期 时间 text`, with line breaks flattened. */
export function talkLine(ms: number, text: string): string {
  return `${localDateTime(ms)} ${text.replace(/[\r\n]+/g, ' ')}\n`;
}

/** An exchange as two lines: `日期 时间 昵称问：…` and `日期 时间 你答：…`. */
export function exchangeLines(ms: number, { nickname, question, answer }: Exchange): string {
  return talkLine(ms, `${nickname}问：${question}`) + talkLine(ms, `你答：${answer}`);
}

/** The last `keep` lines of `text`, to keep prompts from growing without end. */
export function lastLines(text: string, keep: number): string {
  return text.trimEnd().split('\n').slice(-keep).join('\n');
}
