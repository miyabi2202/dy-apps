import type { Curiosity } from './reflection';

/** One of her questions, in `questions.json`: pending until a `--topic` or `--knowledge` run takes it. */
export interface QuestionRecord {
  question: string;
  term: string;
  status: 'pending' | 'done';
  /** When she asked it, YYYY-MM-DD. */
  askedOn: string;
  doneOn?: string;
  /** What came of it: settled, or not (and why). */
  outcome?: string;
}

/** A term as compared for sameness: lowercase, no spaces or quotes or punctuation. */
export function termKey(term: string): string {
  return term.toLowerCase().replace(/[\s「」『』"'“”‘’《》？?！!，,。.、：:]/g, '');
}

/** Whether two terms are the same thing to look up: equal, or one holds the other (two characters or more). */
export function sameTerm(a: string, b: string): boolean {
  const [x, y] = [termKey(a), termKey(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 2 && long.includes(short);
}

/**
 * The questions worth keeping from `asked`: not about a term already searched, not about one a
 * pending question already has, each once, at most `max`.
 */
export function newQuestions(
  asked: readonly Curiosity[],
  {
    searched,
    pending,
    max,
  }: { searched: readonly string[]; pending: readonly QuestionRecord[]; max: number },
): Curiosity[] {
  const taken = [...searched, ...pending.filter((q) => q.status === 'pending').map((q) => q.term)];
  const out: Curiosity[] = [];
  for (const q of asked) {
    if (out.length >= max) break;
    if ([...taken, ...out.map((o) => o.term)].some((t) => sameTerm(t, q.term))) continue;
    out.push(q);
  }
  return out;
}
