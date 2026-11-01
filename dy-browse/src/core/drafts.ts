import { jsonFrom } from './text';

/** A knowledge draft: a new entry, or a change to an existing one (with what changed). */
export interface Draft {
  kind: 'new' | 'change';
  title: string;
  aliases: string[];
  /** 事实 | 惯例 | 规则 | 社区观点 */
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
}

export interface DraftAnswer {
  drafts: Draft[];
  /** Titles of existing entries the posts show are still right. */
  stillRight: string[];
}

const TYPES = new Set(['事实', '惯例', '规则', '社区观点']);

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim())
    : [];
}

/**
 * What the model answered for the drafts, checked: an entry needs a title and a body; a `change`
 * has to name an entry that exists (otherwise it's a new one); "still right" only counts for
 * entries that exist.
 */
export function parseDraftAnswer(text: string, existingTitles: readonly string[]): DraftAnswer {
  const json = jsonFrom(text) as { entries?: unknown; stillRight?: unknown } | undefined;
  const exists = new Set(existingTitles);
  const drafts: Draft[] = [];
  for (const raw of Array.isArray(json?.entries) ? (json.entries as unknown[]) : []) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const title = typeof e.title === 'string' ? e.title.trim() : '';
    const body = typeof e.body === 'string' ? e.body.trim() : '';
    if (!title || !body) continue;
    const change = typeof e.change === 'string' ? e.change.trim() : '';
    drafts.push({
      kind: e.kind === 'change' && exists.has(title) ? 'change' : 'new',
      title,
      aliases: strings(e.aliases),
      type: typeof e.type === 'string' && TYPES.has(e.type) ? e.type : '社区观点',
      asOf: typeof e.asOf === 'string' ? e.asOf.trim() : '',
      body,
      change,
      from: typeof e.from === 'string' ? e.from.trim() : '',
      sources: strings(e.sources),
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
  /** Days until it's to be checked again. */
  reviewInDays?: number;
}

/**
 * One draft in the knowledge base's entry format: the heading, `aliases`, 类型, 截至, 复查 and 来源
 * lines, then the body. A change says what changed above the body.
 */
export function formatDraft(
  draft: Draft,
  { today, path, reviewInDays = 30 }: DraftContext,
): string {
  const sources = draft.sources.length ? `；视频 ${draft.sources.join('、')}` : '';
  const lines = [
    `## ${draft.title}`,
    ...(draft.aliases.length ? [`aliases: ${draft.aliases.join('、')}`] : []),
    `类型: ${draft.type}`,
    `截至: ${draft.asOf || today.slice(0, 7)}`,
    `复查: ${addDays(today, reviewInDays)}`,
    `来源: ${path}${sources}（${today} 学到）`,
    '',
    ...(draft.kind === 'change' ? [`（修改已有条目）变化：${draft.change || '见下'}`, ''] : []),
    draft.body,
  ];
  return lines.join('\n');
}
