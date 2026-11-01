import { parseKnowledge, type KnowledgeEntry } from '../core/knowledge';
import { entriesDue, entryKey, type Visits } from '../core/knowledge-order';
import type { DraftStore } from './draft-store';
import type { DataStore, KnowledgeSource, Log } from './ports';
import type { TopicLearner } from './topic-learner';

export const VISITS_FILE = 'knowledge-visits.json';

export interface KnowledgeRunOptions {
  source: KnowledgeSource;
  data: DataStore;
  drafts: DraftStore;
  learner: Pick<TopicLearner, 'learn'>;
  log: Log;
  now?: () => number;
  /** A heading that finds less than this many posts is searched by its first alias too. */
  minFound?: number;
}

/** Every entry of the chat bot's knowledge base (read-only) as a topic, a few each run. */
export class KnowledgeRun {
  private readonly now: () => number;

  constructor(private readonly options: KnowledgeRunOptions) {
    this.now = options.now ?? Date.now;
  }

  /** The entries, of the folder if given, not `废弃` ones. */
  entries(folder: string | null): KnowledgeEntry[] {
    return this.options.source
      .files()
      .filter((file) => folder === null || file.folder === folder)
      .flatMap((file) => parseKnowledge(file.text, file.folder));
  }

  /**
   * Browses up to `maxTopics` entries: the ones whose 复查 has passed first, then never browsed,
   * then the least recently browsed. An entry that already has an unreviewed draft in `pending/` is
   * skipped. The visits file keeps when each was browsed, so the next run goes on to others.
   */
  async run({
    folder,
    maxTopics,
  }: {
    folder: string | null;
    maxTopics: number;
  }): Promise<string[]> {
    const { data, drafts, learner, log } = this.options;
    const entries = this.entries(folder);
    if (!entries.length) {
      log(`知识库里没有条目${folder ? `（文件夹 ${folder}）` : ''}：没有可浏览的。`);
      return [];
    }
    const visits = readVisits(data.read(VISITS_FILE));
    const pending = drafts.pendingNames();
    const hasDraft = (e: KnowledgeEntry) =>
      [e.title, ...e.aliases].some((n) => pending.has(n.toLowerCase()));
    const due = entriesDue(entries, visits, this.now());
    const picked = due.filter(({ entry }) => {
      if (!hasDraft(entry)) return true;
      log(`knowledge skipped {heading: ${entry.title}, why: 已有未审的草稿}`);
      return false;
    });
    const done: string[] = [];
    for (const { entry, why } of picked.slice(0, maxTopics)) {
      log(`knowledge topic {heading: ${entry.title}, why: ${why}}`);
      const first = await learner.learn(entry.title, { folder: entry.folder, existing: [entry] });
      const alias = entry.aliases[0];
      if (first.found < (this.options.minFound ?? 3) && alias) {
        await learner.learn(alias, { folder: entry.folder, existing: [entry] });
      }
      visits[entryKey(entry)] = this.now();
      data.write(VISITS_FILE, JSON.stringify(visits, null, 2));
      done.push(entry.title);
    }
    return done;
  }
}

function readVisits(text: string | null): Visits {
  if (!text) return {};
  try {
    return JSON.parse(text) as Visits;
  } catch {
    return {};
  }
}
