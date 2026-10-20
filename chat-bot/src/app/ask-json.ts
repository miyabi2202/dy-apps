import type { AskModel, Log, Question } from './ports';

/** How a model's answer is asked for, and read. */
export interface JsonAnswer<T> {
  /** The JSON Schema the answer must follow, added to the question. */
  schema: object;
  /** `text` as the answer, or null when it isn't one (the model ignored the schema). */
  parse: (text: string) => T | null;
  /** What's logged as a warning when `parse` gave null, with the text. */
  notJson: string;
  /** The field the text goes under in that warning. */
  field?: string;
}

/**
 * Asks `ask` `question` for an answer in `answer.schema`'s shape and parses it: the value, or null
 * (after the `notJson` warning) when it isn't, and the text either way. A failing `ask` throws, for
 * the caller to deal with as it does for any other.
 */
export async function askJson<T>(
  ask: AskModel,
  question: Question,
  answer: JsonAnswer<T>,
  log: Log,
): Promise<{ value: T | null; text: string }> {
  const text = await ask({ ...question, schema: answer.schema });
  const value = answer.parse(text);
  if (value === null) log.warn(answer.notJson, { [answer.field ?? 'text']: text });
  return { value, text };
}
