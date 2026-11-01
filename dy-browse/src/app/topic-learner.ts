import { formatDraft, parseDraftAnswer } from '../core/drafts';
import { keywordCandidates, type Candidate } from '../core/keywords';
import type { KnowledgeEntry, KnowledgeIndex } from '../core/knowledge';
import { draftsPrompt, keywordsPrompt, type PromptNode } from '../core/prompts';
import { dateOf, jsonFrom } from '../core/text';
import type { ReadItem } from '../core/types';
import type { DraftStore } from './draft-store';
import type { AskClaude, DataStore, Log } from './ports';
import type { SearchPort } from './topic-search';
import { uniqueById } from './read-answers';
import type { ItemReader } from './video-reader';

export interface TopicLearnerOptions {
  search: SearchPort;
  ask: AskClaude;
  data: DataStore;
  drafts: DraftStore;
  index: KnowledgeIndex;
  log: Log;
  now?: () => number;
  /** Levels of keywords to follow below the topic: 0 searches only the topic. */
  depth?: number;
  /** Searches per topic, the topic's own included. */
  maxSearches?: number;
  /** Keywords followed from one search. */
  maxKeywords?: number;
  /** Tiers 1–2 for each post read; none to stop at the text and comments. */
  reader?: ItemReader | null;
}

/** One search of the walk, as kept in `searches/<date>/<topic>.json` and quoted in a draft's 来源. */
export interface SearchNode {
  term: string;
  parent: string | null;
  level: number;
  hot: string[];
  newest: string[];
  picked: { keyword: string; reason: string }[];
}

export interface LearnResult {
  searches: number;
  /** Posts read over the walk. */
  found: number;
  drafts: number;
  stillRight: number;
  file: string | null;
}

/**
 * Learns what Douyin says about a topic now, and what's next to it: searches it (the hottest and
 * the newest posts), counts keyword candidates by code, has Claude pick among them, searches those
 * (breadth first, `depth` levels, `maxSearches` in all), and turns what it read into knowledge
 * drafts that say where each came from. Nothing is screened while learning.
 */
export class TopicLearner {
  private readonly depth: number;
  private readonly maxSearches: number;
  private readonly maxKeywords: number;
  private readonly now: () => number;

  constructor(private readonly options: TopicLearnerOptions) {
    this.depth = options.depth ?? 1;
    this.maxSearches = options.maxSearches ?? 6;
    this.maxKeywords = options.maxKeywords ?? 4;
    this.now = options.now ?? Date.now;
  }

  async learn(
    topic: string,
    { folder, existing = [] }: { folder: string; existing?: readonly KnowledgeEntry[] },
  ): Promise<LearnResult> {
    const { ask, data, drafts, index, log } = this.options;
    const date = dateOf(this.now());
    const searched = new Set<string>();
    const queue: { term: string; parent: string | null; level: number }[] = [
      { term: topic, parent: null, level: 0 },
    ];
    const tree: SearchNode[] = [];
    const nodes: PromptNode[] = [];
    let found = 0;

    while (queue.length && tree.length < this.maxSearches) {
      const next = queue.shift()!;
      const key = next.term.toLowerCase();
      if (searched.has(key)) continue;
      searched.add(key);
      const result = await this.options.search.search(next.term);
      const posts = uniqueById([...result.hot, ...result.newest]);
      const items: ReadItem[] = [];
      for (const item of posts) {
        const comments = result.comments[item.id] ?? [];
        items.push({
          item,
          comments,
          material: this.options.reader ? await this.options.reader.read(item) : null,
        });
      }
      found += items.length;
      const node: SearchNode = {
        term: next.term,
        parent: next.parent,
        level: next.level,
        hot: result.hot.map((p) => p.id),
        newest: result.newest.map((p) => p.id),
        picked: [],
      };
      tree.push(node);
      nodes.push({ term: next.term, parent: next.parent, items });
      if (next.level < this.depth) {
        const room = this.maxSearches - tree.length - queue.length;
        if (room > 0) {
          const picked = await this.pick(
            next.term,
            items,
            result.related,
            (t) => index.known(t) || searched.has(t.toLowerCase()),
            Math.min(this.maxKeywords, room),
          );
          node.picked = picked;
          for (const { keyword } of picked)
            queue.push({ term: keyword, parent: next.term, level: next.level + 1 });
        }
      }
      log(
        `topic searched {topic: ${next.term}, hot: ${result.hot.length}, newest: ${result.newest.length}, keywords: ${node.picked.length}}`,
      );
    }
    data.write(
      `searches/${date}/${safeName(topic)}.json`,
      JSON.stringify({ topic, date, tree }, null, 2),
    );
    if (found === 0) return { searches: tree.length, found, drafts: 0, stillRight: 0, file: null };

    const answer = parseDraftAnswer(
      await ask(draftsPrompt(topic, nodes, existing, date)),
      existing.map((e) => e.title),
    );
    const formatted = answer.drafts.map((draft) =>
      formatDraft(draft, { today: date, path: pathOf(draft.from || topic, tree, topic) }),
    );
    const file = formatted.length ? drafts.addDrafts(folder, date, formatted) : null;
    const stillRightFile = drafts.addStillRight(
      date,
      answer.stillRight.map((title) => ({
        folder: existing.find((e) => e.title === title)?.folder || folder,
        title,
      })),
    );
    log(
      `drafts written {file: ${file ?? stillRightFile ?? '(none)'}, count: ${formatted.length}, stillRight: ${answer.stillRight.length}}`,
    );
    return {
      searches: tree.length,
      found,
      drafts: formatted.length,
      stillRight: answer.stillRight.length,
      file,
    };
  }

  /** Candidates counted by code; Claude only chooses among them, and only a candidate counts. */
  private async pick(
    topic: string,
    items: readonly ReadItem[],
    related: readonly string[],
    known: (term: string) => boolean,
    max: number,
  ): Promise<{ keyword: string; reason: string }[]> {
    const candidates: Candidate[] = keywordCandidates({
      topic,
      related,
      known,
      posts: items.map(({ item, comments, material }) => ({
        hashtags: item.hashtags,
        texts: [item.desc, ...comments.map((c) => c.text), ...(material?.transcript ?? [])],
      })),
    });
    if (!candidates.length) return [];
    const answer = jsonFrom(await this.options.ask(keywordsPrompt(topic, candidates, max, items)));
    const byTerm = new Map(candidates.map((c) => [c.term.toLowerCase(), c.term]));
    const picked: { keyword: string; reason: string }[] = [];
    for (const raw of Array.isArray(answer) ? (answer as unknown[]) : []) {
      const { keyword, reason } = (raw ?? {}) as { keyword?: unknown; reason?: unknown };
      const term =
        typeof keyword === 'string' ? byTerm.get(keyword.trim().toLowerCase()) : undefined;
      if (term && !picked.some((p) => p.keyword === term)) {
        picked.push({ keyword: term, reason: typeof reason === 'string' ? reason : '' });
      }
    }
    return picked.slice(0, max);
  }
}

/** `抖音搜索「鸣潮」→「今汐」`: the searches from the topic down to `term`. */
function pathOf(term: string, tree: readonly SearchNode[], topic: string): string {
  const chain: string[] = [];
  let at = tree.find((n) => n.term === term);
  while (at) {
    chain.unshift(at.term);
    const parent: string | null = at.parent;
    at = parent ? tree.find((n) => n.term === parent) : undefined;
  }
  if (!chain.length) chain.push(topic);
  return `抖音搜索${chain.map((t) => `「${t}」`).join('→')}`;
}

function safeName(topic: string): string {
  return topic.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'topic';
}
