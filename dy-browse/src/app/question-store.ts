import { newQuestions, sameTerm, type QuestionRecord } from '../core/questions';
import type { Curiosity } from '../core/reflection';
import type { DataStore } from './ports';

export const QUESTIONS_FILE = 'questions.json';

/**
 * Her questions, in dy-browse's `questions.json`: the reflection adds what she's curious about
 * (each once, nothing already searched), and the next `--topic` or `--knowledge` run looks the
 * pending ones up first and marks them done with what came of it.
 */
export class QuestionStore {
  constructor(private readonly data: DataStore) {}

  all(): QuestionRecord[] {
    const text = this.data.read(QUESTIONS_FILE);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text) as { questions?: QuestionRecord[] };
      return Array.isArray(parsed.questions) ? parsed.questions : [];
    } catch {
      return [];
    }
  }

  pending(): QuestionRecord[] {
    return this.all().filter((q) => q.status === 'pending');
  }

  /** Every term searched so far, from the trees in `searches/`. */
  searchedTerms(): string[] {
    const terms = new Set<string>();
    for (const path of this.data.list('searches')) {
      if (!path.endsWith('.json')) continue;
      try {
        const file = JSON.parse(this.data.read(path) ?? '{}') as { tree?: { term?: unknown }[] };
        for (const node of file.tree ?? []) if (typeof node.term === 'string') terms.add(node.term);
      } catch {
        // a broken file has no terms
      }
    }
    return [...terms];
  }

  /** Adds the questions not already searched or pending, at most `max`; gives the ones added. */
  add(asked: readonly Curiosity[], date: string, max: number): Curiosity[] {
    const all = this.all();
    const added = newQuestions(asked, { searched: this.searchedTerms(), pending: all, max });
    if (added.length) {
      this.save([
        ...all,
        ...added.map((q): QuestionRecord => ({ ...q, status: 'pending', askedOn: date })),
      ]);
    }
    return added;
  }

  /** Marks the pending question about `term` done, with what came of it. */
  done(term: string, date: string, outcome: string): void {
    const all = this.all();
    let changed = false;
    for (const q of all) {
      if (q.status === 'pending' && sameTerm(q.term, term)) {
        Object.assign(q, { status: 'done', doneOn: date, outcome });
        changed = true;
      }
    }
    if (changed) this.save(all);
  }

  private save(questions: readonly QuestionRecord[]): void {
    this.data.write(QUESTIONS_FILE, JSON.stringify({ questions }, null, 2));
  }
}
