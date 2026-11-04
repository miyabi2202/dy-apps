import type { KnowledgeEntry } from '../core/knowledge';
import { clip, dateOf } from '../core/text';
import type { Log } from './ports';
import type { ToLearnList } from './to-learn-list';
import { SOURCE_NAMES, type LearnResult, type TopicLearner } from './topic-learner';

export interface TodoRunOptions {
  list: ToLearnList;
  learner: Pick<TopicLearner, 'learn'>;
  /** The knowledge base's entries about a term, so a draft can be a change or "still right". */
  existing: (term: string) => readonly KnowledgeEntry[];
  log: Log;
  now?: () => number;
}

/**
 * `--todo [n]`: the first `n` open items of the to-learn list, each learnt like `--topic <term>`
 * with the item's question looked up first, then ticked off with what came of it. An item a run
 * stopped in (a captcha, a stream starting) stays open, and so does one whose own search was
 * skipped (a step that timed out) without its question settled: nothing was read to learn from.
 */
export class TodoRun {
  constructor(private readonly options: TodoRunOptions) {}

  async run({ count, folder }: { count: number; folder: string }): Promise<string[]> {
    const { list, learner, existing, log, now = Date.now } = this.options;
    const items = list.open().slice(0, count);
    if (!items.length) {
      log('待学清单里没有没打勾的：没有可学的。');
      return [];
    }
    const done: string[] = [];
    for (const item of items) {
      log(`todo item {term: ${item.term}, from: ${item.from || '(none)'}}`);
      const why = item.notes.filter((note) => !note.includes('pnpm ')).join(' ');
      const result = await learner.learn(item.term, {
        folder,
        existing: existing(item.term),
        carry: { question: item.question || `「${item.term}」是什么？`, why },
      });
      if (!result.searches && result.carried?.status !== 'resolved') {
        log(`todo left open {term: ${item.term}, why: its search did not run}`);
        continue;
      }
      const outcome = todoOutcome(result, dateOf(now()));
      list.done(item.term, outcome);
      log(`todo done {term: ${item.term}, outcome: ${outcome}}`);
      done.push(item.term);
    }
    return done;
  }
}

/** What a to-learn item's line gets when it's ticked: learnt (and how many drafts), or not found. */
export function todoOutcome(result: LearnResult, date: string): string {
  const { carried, drafts } = result;
  if (carried?.status === 'resolved' && carried.answer) {
    const where = carried.source ? `（${SOURCE_NAMES[carried.source]}）` : '';
    return `${date} 学到${where}：${clip(carried.answer, 60)}；草稿 ${drafts} 条`;
  }
  if (drafts > 0) return `${date} 学到，草稿 ${drafts} 条`;
  return `${date} 没查到，见 ${result.searchFile}`;
}
