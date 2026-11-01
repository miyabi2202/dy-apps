import { isReplyRef, postOfRef } from './comments';
import { jsonFrom } from './text';
import { knownRefs, postsOf } from './understand';

/** A knowledge draft: a new entry, or a change to an existing one (with what changed). */
export interface Draft {
  kind: 'new' | 'change';
  title: string;
  aliases: string[];
  /** 事实 | 惯例 | 规则 | 梗 | 社区观点 */
  type: string;
  /** What it's true as of: a version or a month. */
  asOf: string;
  body: string;
  /** For a change: what changed. */
  change: string;
  /** The search term it was found under, to say where it came from. */
  from: string;
  /** Ids of the posts that show it. */
  sources: string[];
  /** Web pages it rests on (from the unknowns it cites, resolved on the web). */
  urls: string[];
}

/** A 梗's parts (CHIME's): what it means, where it came from, how it's used, what kind it is. */
export interface Meme {
  meaning: string;
  /** Where it came from, only as Douyin shows it; 不确定 without a post or a reply for it. */
  origin: string;
  /** The posts or replies the origin rests on. */
  originRefs: string[];
  examples: string[];
  /** 谐音、缩写、拼音首字母、台词、动作…… */
  form: string;
}

export interface DraftAnswer {
  drafts: Draft[];
  /** Titles of existing entries the posts show are still right. */
  stillRight: string[];
}

/** The types the model may write; 社区观点 cards are made by code from the counted opinions. */
const TYPES = new Set(['事实', '惯例', '规则', '梗']);

/** Days until a card of each type is checked again: memes and opinions go stale fastest. */
export const REVIEW_DAYS: Record<string, number> = {
  事实: 90,
  规则: 90,
  惯例: 60,
  梗: 30,
  社区观点: 21,
};

/** The fewest different posts a 梗 must be seen used in to become a card. */
export const MIN_MEME_USAGES = 2;

/** What the drafts may rest on, from what the walk read and looked up. */
export interface DraftEvidence {
  /** Every post id read, and every comment's and reply's ref. */
  refs: ReadonlySet<string>;
  /** Unknowns settled in full (by their id, `u1`…), with the pages they rest on. */
  resolved: ReadonlyMap<string, { urls: string[] }>;
  /** Terms of unknowns left unsettled: never a card. */
  unresolved: readonly string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[\s「」『』"'“”]/g, '');

/** Whether one of `names` is (or holds, or is held by) one of `terms`. */
function namesOneOf(names: readonly string[], terms: readonly string[]): boolean {
  return names.some((name) =>
    terms.some((term) => {
      const [a, b] = [norm(name), norm(term)];
      return !!a && !!b && (a === b || (b.length >= 2 && a.includes(b)));
    }),
  );
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A 梗's body, CHIME's four parts, from its parts. */
export function memeBody(meme: Meme): string {
  const origin = meme.originRefs.length
    ? `${meme.origin}（见 ${meme.originRefs.join('、')}）`
    : '不确定（抖音上没找到作品或回复为证，不写）';
  return [
    `含义：${meme.meaning}`,
    `出处：${origin}`,
    `例句：${meme.examples.length ? meme.examples.map((e) => `「${e}」`).join(' ') : '（无）'}`,
    `类型：${meme.form || '不详'}`,
  ].join('\n');
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim())
    : [];
}

/**
 * What the model answered for the drafts, checked: an entry needs a title and a body; a `change`
 * has to name an entry that exists (otherwise it's a new one); "still right" only counts for
 * entries that exist. With `evidence`, each card must rest on what was read: a 事实 or 规则 on a
 * post or an unknown settled in full (never on comments alone; one about a person on a settled
 * unknown or two posts); a 梗 on usages in at least two different posts, its 出处 only on a post or
 * a reply; nothing about an unknown left unsettled; no 社区观点 (code writes those).
 */
export function parseDraftAnswer(
  text: string,
  existingTitles: readonly string[],
  evidence?: DraftEvidence,
): DraftAnswer {
  const json = jsonFrom(text) as { entries?: unknown; stillRight?: unknown } | undefined;
  const exists = new Set(existingTitles);
  const drafts: Draft[] = [];
  for (const raw of Array.isArray(json?.entries) ? (json.entries as unknown[]) : []) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const title = trimmed(e.title);
    let body = trimmed(e.body);
    const type = trimmed(e.type) || '惯例';
    if (!title || !TYPES.has(type)) continue;
    const aliases = strings(e.aliases);
    let sources = strings(e.sources);
    let urls: string[] = [];
    if (evidence) {
      if (namesOneOf([title, ...aliases], evidence.unresolved)) continue;
      sources = sources.filter((id) => !id.includes('#') && evidence.refs.has(id));
      const resolved = strings(e.resolved).filter((id) => evidence.resolved.has(id));
      urls = [...new Set(resolved.flatMap((id) => evidence.resolved.get(id)!.urls))];
      if (type === '事实' || type === '规则') {
        if (!resolved.length && !sources.length) continue;
        if (e.aboutPerson === true && !resolved.length && sources.length < 2) continue;
      }
    }
    if (type === '梗') {
      const m = (e.meme ?? {}) as Record<string, unknown>;
      const meaning = trimmed(m.meaning);
      if (!meaning) continue;
      const known = evidence?.refs;
      const usages = known ? knownRefs(e.usages, known) : strings(e.usages);
      const usedIn = postsOf(usages);
      if (evidence && usedIn.length < MIN_MEME_USAGES) continue;
      const originRefs = (known ? knownRefs(m.originRefs, known) : strings(m.originRefs)).filter(
        (ref) => !ref.includes('#') || isReplyRef(ref),
      );
      body = memeBody({
        meaning,
        origin: originRefs.length ? trimmed(m.origin) : '',
        originRefs: trimmed(m.origin) ? originRefs : [],
        examples: strings(m.examples).slice(0, 3),
        form: trimmed(m.form),
      });
      sources = [...new Set([...sources, ...usedIn, ...originRefs.map(postOfRef)])];
    }
    if (!body) continue;
    drafts.push({
      kind: e.kind === 'change' && exists.has(title) ? 'change' : 'new',
      title,
      aliases,
      type,
      asOf: trimmed(e.asOf),
      body,
      change: trimmed(e.change),
      from: trimmed(e.from),
      sources,
      urls,
    });
  }
  return { drafts, stillRight: strings(json?.stillRight).filter((title) => exists.has(title)) };
}

/** `date` (YYYY-MM-DD) plus `days`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface DraftContext {
  /** Today, YYYY-MM-DD. */
  today: string;
  /** Where it came from: the search path, e.g. `抖音搜索「鸣潮」→「今汐」`. */
  path: string;
  /** Days until it's to be checked again; by its type (REVIEW_DAYS) when not given. */
  reviewInDays?: number;
}

/**
 * One draft in the knowledge base's entry format: the heading, `aliases`, 类型, 截至, 复查 and 来源
 * lines, then the body. A change says what changed above the body.
 */
export function formatDraft(
  draft: Draft,
  { today, path, reviewInDays = REVIEW_DAYS[draft.type] ?? 30 }: DraftContext,
): string {
  const sources = draft.sources.length ? `；视频 ${draft.sources.join('、')}` : '';
  const urls = draft.urls.length ? `；网页 ${draft.urls.join(' ')}` : '';
  const lines = [
    `## ${draft.title}`,
    ...(draft.aliases.length ? [`aliases: ${draft.aliases.join('、')}`] : []),
    `类型: ${draft.type}`,
    `截至: ${draft.asOf || today.slice(0, 7)}`,
    `复查: ${addDays(today, reviewInDays)}`,
    `来源: ${path}${sources}${urls}（${today} 学到）`,
    '',
    ...(draft.kind === 'change' ? [`（修改已有条目）变化：${draft.change || '见下'}`, ''] : []),
    draft.body,
  ];
  return lines.join('\n');
}

/** One unknown that stayed unsettled, for the drafts file's 未确认 section. */
export interface UnsettledNote {
  question: string;
  /** What each stage found, `kb: none` and so on. */
  tried: string;
}

/**
 * The 未确认 section of a drafts file: what was looked up and not settled, so a reviewer sees it
 * was asked; it isn't an entry and is never one.
 */
export function unresolvedSection(
  topic: string,
  today: string,
  notes: readonly UnsettledNote[],
): string {
  return [
    `## 未确认（「${topic}」，${today}）`,
    '类型: 未确认',
    '',
    '不是条目：这些查过了还没查实，不要写进知识库（审核时删掉这一节）。',
    ...notes.map((n) => `- ${n.question}（${n.tried}）`),
  ].join('\n');
}
