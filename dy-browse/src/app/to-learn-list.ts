import {
  addItems,
  itemsToAdd,
  markDone,
  openItems,
  type AddOptions,
  type NewItem,
  type ToLearnItem,
} from '@dy-apps/to-learn';
import type { DataStore, Log } from './ports';

/** The to-learn list, in the chat bot's `data/`. */
export const TO_LEARN_FILE = 'browse/to-learn.md';
/** Her old questions file in dy-browse's `data/`, before the list; renamed once its items moved. */
export const OLD_QUESTIONS_FILE = 'questions.json';
export const MIGRATED_QUESTIONS_FILE = 'questions.migrated.json';

/** What the file says about itself when a run makes it. */
const HEADER = [
  '# 还要学的',
  '',
  '机器人还不知道、想学的东西，一行一条：`- [ ] 词 — 问题（从哪来的）`，学完打勾，后面写学到了什么。',
  '人可以随手加、改、删；她刷抖音后的好奇会自动加进来。',
  '`pnpm browse --todo` 学最前面几条没打勾的。',
  '',
].join('\n');

/**
 * The to-learn list (`browse/to-learn.md` in the chat bot's `data/`), a checklist a person edits by
 * hand: her reflection adds to it, and `--todo` learns its open items and ticks them off. The line
 * format is `@dy-apps/to-learn`'s; every line that isn't an item stays as it is.
 */
export class ToLearnList {
  constructor(private readonly bot: DataStore) {}

  private text(): string {
    return this.bot.read(TO_LEARN_FILE) ?? '';
  }

  /** The items not done yet, in file order. */
  open(): ToLearnItem[] {
    return openItems(this.text());
  }

  /** Adds the items not on the list (open or done) and not `known`; gives the ones added. */
  add(wanted: readonly NewItem[], options?: AddOptions): NewItem[] {
    const text = this.bot.read(TO_LEARN_FILE) ?? HEADER;
    const added = itemsToAdd(text, wanted, options);
    if (added.length) this.bot.write(TO_LEARN_FILE, addItems(text, added));
    return added;
  }

  /** Ticks the open item about `term`, with what came of it. */
  done(term: string, outcome: string): void {
    const text = this.text();
    const next = markDone(text, term, outcome);
    if (next !== text) this.bot.write(TO_LEARN_FILE, next);
  }
}

/**
 * Moves her pending questions from the old `questions.json` (dy-browse's `data/`) onto the list,
 * once: the file is then renamed `questions.migrated.json`. Gives how many were added.
 */
export function migrateQuestions(data: DataStore, list: ToLearnList, log: Log): number {
  const text = data.read(OLD_QUESTIONS_FILE);
  if (text === null) return 0;
  let questions: unknown[] = [];
  try {
    const parsed = JSON.parse(text) as { questions?: unknown };
    if (Array.isArray(parsed.questions)) questions = parsed.questions as unknown[];
  } catch {
    // a broken file has nothing to move; it's still renamed, so it's not read again
  }
  const pending: NewItem[] = questions.flatMap((raw) => {
    const q = (raw ?? {}) as Record<string, unknown>;
    if (q.status !== 'pending' || typeof q.term !== 'string' || typeof q.question !== 'string')
      return [];
    const askedOn = typeof q.askedOn === 'string' ? ` ${q.askedOn}` : '';
    return [{ term: q.term, question: q.question, from: `刷抖音时好奇${askedOn}` }];
  });
  const added = pending.length ? list.add(pending) : [];
  data.write(MIGRATED_QUESTIONS_FILE, text);
  data.remove(OLD_QUESTIONS_FILE);
  log(
    `questions migrated {pending: ${pending.length}, added: ${added.length}, to: ${TO_LEARN_FILE}}`,
  );
  return added.length;
}
