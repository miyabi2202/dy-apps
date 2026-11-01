import { termKey } from '@dy-apps/to-learn';
import {
  formatDraft,
  parseDraftAnswer,
  unresolvedSection,
  type Draft,
  type UnsettledNote,
} from '../core/drafts';
import { EmptyReadError, RunStopped } from '../core/errors';
import { keywordCandidates, type Candidate } from '../core/keywords';
import type { KnowledgeEntry, KnowledgeIndex } from '../core/knowledge';
import {
  countOpinions,
  keptOpinions,
  opinionDraft,
  topOpinions,
  type CountedOpinion,
} from '../core/opinions';
import { draftsPrompt, keywordsPrompt, type PromptNode } from '../core/prompts';
import { settled, type Resolution } from '../core/resolve';
import { dateOf, jsonFrom } from '../core/text';
import type { ReadItem } from '../core/types';
import {
  parseUnderstanding,
  refsOf,
  understandPrompt,
  type Claim,
  type Understanding,
  type Unknown,
} from '../core/understand';
import type { DraftStore } from './draft-store';
import type { AskClaude, DataStore, Log } from './ports';
import type { SearchPort, SearchResult } from './topic-search';
import { uniqueById } from './read-answers';
import { UnknownResolver } from './unknown-resolver';
import type { ItemReader } from './video-reader';

export interface TopicLearnerOptions {
  search: SearchPort;
  ask: AskClaude;
  /** Claude with only WebSearch and WebFetch, for looking unknowns up; none to skip the web. */
  askWeb?: AskClaude | null;
  data: DataStore;
  drafts: DraftStore;
  index: KnowledgeIndex;
  log: Log;
  now?: () => number;
  /** Levels of keywords to follow below the topic: 0 searches only the topic. */
  depth?: number;
  /** Searches per topic, the topic's own included (the searches for unknowns too). */
  maxSearches?: number;
  /** Keywords followed from one search. */
  maxKeywords?: number;
  /** Unknowns looked up over all the topics this learner does (a run's). */
  maxUnknowns?: number;
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
  /** Why it was searched, when it was for an unknown. */
  reason?: string;
}

/** An unknown of the walk, with what each stage found, as kept in the searches file. */
export interface TrackedUnknown {
  /** `u1`, `u2`…: what the drafts prompt cites it by. */
  id: string;
  unknown: Unknown;
  /** The search it was raised by; `to-learn.md` for the question a `--todo` item carried. */
  from: string;
  resolutions: Resolution[];
  status: 'open' | 'resolved' | 'unresolved';
  note?: string;
  /** The question the caller carried in (a to-learn item's), not one a search raised. */
  carried?: boolean;
}

export interface LearnResult {
  searches: number;
  /** Posts read over the walk. */
  found: number;
  drafts: number;
  stillRight: number;
  file: string | null;
  /** Everything read, for the run's reflection. */
  reads: ReadItem[];
  /** What the topic's own search read (not its keywords' or unknowns'), for the reflection to keep to. */
  ownReads: ReadItem[];
  /** Unknowns raised by this topic's searches. */
  unknowns: number;
  unresolved: number;
  /** Where the walk was written: `searches/<date>/<topic>.json` in dy-browse's `data/`. */
  searchFile: string;
  /** What came of the carried question; null when none was carried (or the run had no room for it). */
  carried: CarriedOutcome | null;
}

/** What came of a carried question. */
export interface CarriedOutcome {
  status: 'resolved' | 'unresolved';
  /** The answer that settled it, and where it came from. */
  answer?: string;
  source?: Resolution['source'];
  note?: string;
}

/** A question to look up first, with the topic: a to-learn item's. */
export interface Carry {
  question: string;
  /** Why it's asked (what's known already), for the lookups. */
  why?: string;
}

interface Queued {
  term: string;
  parent: string | null;
  level: number;
  /** Set for a search that looks an unknown up. */
  unknown?: TrackedUnknown;
}

const NOTHING: Understanding = { unknowns: [], opinions: [], claims: [] };

/**
 * Learns what Douyin says about a topic now, and what's next to it: searches it (the hottest and
 * the newest posts), and after each search has Claude say what it doesn't actually know, what
 * people think and what they claim. Each unknown is looked up in stages (the knowledge base, the
 * web, then a Douyin search of its own at the front of the queue, sharing `maxSearches`), and what
 * stays unsettled is never a card. Keyword candidates are counted by code and Claude picks among
 * them (breadth first, `depth` levels). What it read becomes knowledge drafts that say where each
 * came from; the opinions become 社区观点 cards by code, kept only when seen under two creators.
 * Nothing is screened while learning.
 */
export class TopicLearner {
  private readonly depth: number;
  private readonly maxSearches: number;
  private readonly maxKeywords: number;
  private readonly now: () => number;
  private readonly resolver: UnknownResolver;
  /** Unknowns still allowed this run, and the terms already raised (so each is looked up once). */
  private unknownsLeft: number;
  private readonly raised = new Set<string>();
  private unknownIds = 0;

  constructor(private readonly options: TopicLearnerOptions) {
    this.depth = options.depth ?? 1;
    this.maxSearches = options.maxSearches ?? 6;
    this.maxKeywords = options.maxKeywords ?? 4;
    this.now = options.now ?? Date.now;
    this.unknownsLeft = options.maxUnknowns ?? 8;
    this.resolver = new UnknownResolver({
      ask: options.ask,
      askWeb: options.askWeb,
      index: options.index,
      log: options.log,
      today: () => dateOf(this.now()),
    });
  }

  async learn(
    topic: string,
    {
      folder,
      existing = [],
      carry,
    }: { folder: string; existing?: readonly KnowledgeEntry[]; carry?: Carry },
  ): Promise<LearnResult> {
    const { ask, data, drafts, index, log } = this.options;
    const date = dateOf(this.now());
    const searched = new Set<string>();
    const queue: Queued[] = [{ term: topic, parent: null, level: 0 }];
    const tree: SearchNode[] = [];
    const nodes: PromptNode[] = [];
    const itemsByTerm = new Map<string, ReadItem[]>();
    const unknowns: TrackedUnknown[] = [];
    const opinions: CountedOpinion[] = [];
    const claims: (Claim & { from: string })[] = [];
    // The carried question is the first unknown of the topic's own search, looked up like any other.
    const asked = carry ? this.carry(topic, carry) : [];
    const carried = [...asked];
    let found = 0;

    while (queue.length && tree.length < this.maxSearches) {
      const next = queue.shift()!;
      const key = next.term.toLowerCase();
      if (searched.has(key)) {
        if (next.unknown) await this.judge(next.unknown, itemsByTerm.get(key) ?? []);
        continue;
      }
      searched.add(key);
      const result = await this.searchOrSkip(next);
      if (!result) {
        if (next.unknown) {
          next.unknown.status = 'unresolved';
          next.unknown.note = '抖音搜索没成功';
        }
        continue;
      }
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
      itemsByTerm.set(key, items);
      const node: SearchNode = {
        term: next.term,
        parent: next.parent,
        level: next.level,
        hot: result.hot.map((p) => p.id),
        newest: result.newest.map((p) => p.id),
        picked: [],
        ...(next.unknown ? { reason: `查证：${next.unknown.unknown.question}` } : {}),
      };
      tree.push(node);
      nodes.push({ term: next.term, parent: next.parent, items });

      if (next.unknown) {
        await this.judge(next.unknown, items);
      } else {
        const understanding = items.length ? await this.understand(next.term, items) : NOTHING;
        opinions.push(...countOpinions(understanding.opinions, items, next.term));
        claims.push(...understanding.claims.map((c) => ({ ...c, from: next.term })));
        const fresh = [
          ...(next.level === 0 ? carried.splice(0) : []),
          ...this.admit(understanding.unknowns, next.term),
        ];
        unknowns.push(...fresh.filter((u) => !unknowns.includes(u)));
        const toSearch: TrackedUnknown[] = [];
        for (const tracked of fresh) {
          tracked.resolutions.push(...(await this.resolver.offline(tracked.unknown)));
          if (settled(tracked.resolutions)) tracked.status = 'resolved';
          else toSearch.push(tracked);
        }
        const room = Math.max(0, this.maxSearches - tree.length - queue.length);
        for (const tracked of toSearch.slice(room)) {
          tracked.status = 'unresolved';
          tracked.note = '没有搜索名额了';
        }
        queue.unshift(
          ...toSearch.slice(0, room).map((tracked) => ({
            term: tracked.unknown.term,
            parent: next.term,
            level: next.level + 1,
            unknown: tracked,
          })),
        );
        if (next.level < this.depth) {
          const left = this.maxSearches - tree.length - queue.length;
          if (left > 0) {
            const picked = await this.pick(
              next.term,
              items,
              result.related,
              (t) => index.known(t) || searched.has(t.toLowerCase()),
              Math.min(this.maxKeywords, left),
            );
            node.picked = picked;
            for (const { keyword } of picked)
              queue.push({ term: keyword, parent: next.term, level: next.level + 1 });
          }
        }
      }
      log(
        `topic searched {topic: ${next.term}, hot: ${result.hot.length}, newest: ${result.newest.length}, keywords: ${node.picked.length}${next.unknown ? `, for: ${next.unknown.unknown.term}` : ''}}`,
      );
    }
    for (const tracked of [...unknowns, ...carried]) {
      if (tracked.status === 'open') {
        tracked.status = 'unresolved';
        tracked.note = '没有搜索名额了';
      }
    }
    const unresolved = unknowns.filter((u) => u.status === 'unresolved');
    const reads = nodes.flatMap((n) => n.items);
    const searchFile = `searches/${date}/${safeName(topic)}.json`;
    data.write(
      searchFile,
      JSON.stringify(
        {
          topic,
          date,
          tree,
          unknowns,
          unresolved: unresolved.map((u) => u.unknown.question),
          opinions,
          claims,
        },
        null,
        2,
      ),
    );
    const base = {
      searches: tree.length,
      found,
      reads,
      ownReads: [...(nodes.find((n) => n.term === topic)?.items ?? [])],
      unknowns: unknowns.filter((u) => !u.carried).length,
      unresolved: unresolved.length,
      searchFile,
      carried: asked[0] ? outcomeOf(asked[0]) : null,
    };
    if (found === 0) return { ...base, drafts: 0, stillRight: 0, file: null };

    const settledOnes = unknowns.filter((u) => u.status === 'resolved');
    const answer = parseDraftAnswer(
      await ask(
        draftsPrompt(topic, nodes, existing, date, {
          settled: settledOnes.map((u) => {
            const last = u.resolutions.at(-1)!;
            return {
              id: u.id,
              question: u.unknown.question,
              answer: last.answer,
              source: SOURCE_NAMES[last.source],
              urls: last.urls ?? [],
            };
          }),
          unresolved: unresolved.map((u) => u.unknown.term),
          claims,
        }),
      ),
      existing.map((e) => e.title),
      {
        refs: refsOf(reads),
        resolved: new Map(
          settledOnes.map((u) => [u.id, { urls: u.resolutions.at(-1)!.urls ?? [] }]),
        ),
        unresolved: unresolved.map((u) => u.unknown.term),
      },
    );
    // One card for the topic, its most widely held views first, however many searches they came from.
    const views = topOpinions(keptOpinions(opinions));
    const card = opinionDraft(topic, views);
    const cards: Draft[] = card ? [...answer.drafts, card] : answer.drafts;
    const formatted = cards.map((draft) =>
      formatDraft(draft, { today: date, path: pathOf(draft.from || topic, tree, topic) }),
    );
    const notes: UnsettledNote[] = unresolved.map((u) => ({
      question: u.unknown.question,
      tried:
        [
          ...u.resolutions.map((r) => `${r.source}: ${r.supports}`),
          ...(u.note ? [u.note] : []),
        ].join('；') || '没查',
    }));
    const sections = [
      ...formatted,
      ...(notes.length ? [unresolvedSection(topic, date, notes)] : []),
    ];
    const file = sections.length ? drafts.addDrafts(folder, date, sections) : null;
    const stillRightFile = drafts.addStillRight(
      date,
      answer.stillRight.map((title) => ({
        folder: existing.find((e) => e.title === title)?.folder || folder,
        title,
      })),
    );
    log(
      `drafts written {file: ${file ?? stillRightFile ?? '(none)'}, count: ${formatted.length}, stillRight: ${answer.stillRight.length}, unresolved: ${notes.length}}`,
    );
    return { ...base, drafts: formatted.length, stillRight: answer.stillRight.length, file };
  }

  /** What a search's posts leave unknown, what people think, what they claim (one Claude call). */
  private async understand(term: string, items: readonly ReadItem[]): Promise<Understanding> {
    return parseUnderstanding(await this.options.ask(understandPrompt(term, items)), refsOf(items));
  }

  /** The unknowns worth looking up: each term once a run, within what the run still allows. */
  private admit(raised: readonly Unknown[], from: string): TrackedUnknown[] {
    const out: TrackedUnknown[] = [];
    for (const unknown of raised) {
      if (this.unknownsLeft <= 0) break;
      const key = termKey(unknown.term);
      if (!key || this.raised.has(key)) continue;
      this.raised.add(key);
      this.unknownsLeft--;
      out.push({ id: `u${++this.unknownIds}`, unknown, from, resolutions: [], status: 'open' });
    }
    return out;
  }

  /** The caller's question about `term`, as an unknown (within the run's allowance, once a run). */
  private carry(term: string, { question, why }: Carry): TrackedUnknown[] {
    return this.admit(
      [{ question, term, kind: '其他' as const, why: why || '待学清单上的', refs: [] }],
      'to-learn.md',
    ).map((tracked) => ({ ...tracked, carried: true }));
  }

  /** An unknown judged on what its Douyin search read: settled, or left unresolved. */
  private async judge(tracked: TrackedUnknown, items: readonly ReadItem[]): Promise<void> {
    tracked.resolutions.push(await this.resolver.onDouyin(tracked.unknown, items));
    tracked.status = settled(tracked.resolutions) ? 'resolved' : 'unresolved';
  }

  /**
   * One search, or null when it failed for a reason of its own (a page that showed no grid, a
   * follow-up search that read nothing): logged, and the walk goes on. A captcha or login wall, a
   * stream starting, or the topic's own search reading nothing still stops the run.
   */
  private async searchOrSkip(next: Queued): Promise<SearchResult | null> {
    try {
      return await this.options.search.search(next.term);
    } catch (e) {
      const skippable =
        !(e instanceof RunStopped) || (e instanceof EmptyReadError && next.level > 0);
      if (!skippable) throw e;
      this.options.log(
        `search skipped {term: ${next.term}, why: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}}`,
      );
      return null;
    }
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

function outcomeOf(tracked: TrackedUnknown): CarriedOutcome {
  const last = tracked.resolutions.at(-1);
  if (tracked.status === 'resolved' && last) {
    return { status: 'resolved', answer: last.answer, source: last.source };
  }
  return { status: 'unresolved', ...(tracked.note ? { note: tracked.note } : {}) };
}

export const SOURCE_NAMES: Record<Resolution['source'], string> = {
  kb: '知识库',
  web: '网上',
  douyin: '抖音',
};

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
