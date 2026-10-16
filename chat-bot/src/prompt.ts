import type { ChatLine } from './chat-history';

export interface PromptInput {
  /** Recent chat before the question, oldest first. */
  history: readonly ChatLine[];
  asker: string;
  question: string;
  /** How many characters the answer may use. */
  maxLength: number;
}

/**
 * Fills a prompt template: `{{history}}` becomes one `昵称: 内容` line per chat, `{{asker}}`
 * and `{{question}}` the mention's sender and text, and `{{maxLength}}` the answer's length limit.
 */
export function buildPrompt(
  template: string,
  { history, asker, question, maxLength }: PromptInput,
): string {
  const values: Record<string, string> = {
    history: history.map((line) => `${line.nickname}: ${line.content}`).join('\n') || '（暂无）',
    asker,
    question: question || '（只 @ 了你，没有说别的）',
    maxLength: String(maxLength),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}
