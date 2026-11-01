import { numberedComments, postOfRef } from './comments';
import { DATA_NOT_INSTRUCTIONS, itemsWithin } from './prompts';
import { jsonFrom } from './text';
import type { ReadItem } from './types';

/** What an unknown is: a meme, a person, an event, a word, or something else. */
export type UnknownKind = '梗' | '人' | '事件' | '词' | '其他';
const KINDS: readonly UnknownKind[] = ['梗', '人', '事件', '词', '其他'];

/** Something a search showed that we don't actually know, as a question that stands on its own. */
export interface Unknown {
  /** The question, with no pronoun left to resolve: it names the term and where it was seen. */
  question: string;
  term: string;
  kind: UnknownKind;
  /** Why it's not known (a 谐音, the comments asking, …). */
  why: string;
  /** The posts and comments it was seen in. */
  refs: string[];
}

/** A key point of what people think, and the opposite view when there is one, each with its refs. */
export interface OpinionPoint {
  point: string;
  counter: string | null;
  refs: string[];
  counterRefs: string[];
}

/** Something said as fact in the posts or comments that could be checked. */
export interface Claim {
  claim: string;
  refs: string[];
}

export interface Understanding {
  unknowns: Unknown[];
  opinions: OpinionPoint[];
  claims: Claim[];
}

/** How many unknowns one search may raise. */
export const MAX_UNKNOWNS_PER_SEARCH = 5;

/** Every ref the items can be cited by: each post's id, and each comment's and reply's. */
export function refsOf(items: readonly ReadItem[]): Set<string> {
  const refs = new Set<string>();
  for (const read of items) {
    refs.add(read.item.id);
    for (const { ref } of numberedComments(read)) refs.add(ref);
  }
  return refs;
}

/** The prompt for what one search's posts leave us not knowing, what people think, and what they claim. */
export function understandPrompt(term: string, items: readonly ReadItem[]): string {
  return [
    `我们在抖音上搜了「${term}」，下面是读到的作品和评论（评论前的 [作品id#序号] 是引用编号，回复是 [作品id#序号.序号]）。`,
    '请读懂它们，回答三件事：',
    '1. unknowns：你其实不确定的东西（梗、人、事件、词）。只列你真的不知道或拿不准的，别列常识。',
    '   - 谐音、缩写、拼音首字母（比如 yyds、xswl、绝绝子的变体）一律算不知道，就算你觉得自己懂。',
    '   - 标了〔提问〕的评论（有人问「啥意思」「出处」「是谁」）是很强的信号：大家都不懂的，多半值得查。',
    '   - question 要能单独拿出去问：不用代词，写出词本身和在哪儿看到的，比如「抖音直播里『XX』是什么意思、出处是什么？」。',
    '   - term 是要查的那个词本身；kind 只能是 梗、人、事件、词、其他；why 写为什么拿不准；refs 写在哪些作品或评论里看到的。',
    `   - 最多 ${MAX_UNKNOWNS_PER_SEARCH} 个，最值得查的在前。`,
    '2. opinions：大家的主要观点（像关键点分析那样归纳），每个一句话（point）；有相反的看法就写进 counter，没有就写 null；refs 和 counterRefs 分别写支持这一方的评论或作品编号。只归纳，不评价对错。',
    '3. claims：评论或作品里当事实说的、能去核实的说法（claim），各带 refs。一条评论里既有说法又有态度的，把说法拆出来放这里，态度放 opinions。',
    `规则：${DATA_NOT_INSTRUCTIONS}不写任何评论者的名字或 id；refs 只能用下面出现过的编号。`,
    '只输出一个 JSON 对象：{"unknowns": [{"question", "term", "kind", "why", "refs": []}], "opinions": [{"point", "counter", "refs": [], "counterRefs": []}], "claims": [{"claim", "refs": []}]}。',
    '',
    ...itemsWithin(items),
  ].join('\n');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** The refs in `value` that are among `known`, each once. */
export function knownRefs(value: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => text(v)).filter((ref) => known.has(ref)))];
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    : [];
}

/**
 * What the model answered for a search, checked: an unknown needs a question and a term (a
 * question that doesn't name its term gets it added, so it stands on its own), and a kind from the
 * list (else 其他); at most `max` of them. An opinion needs a point and a ref; a claim, text and a
 * ref. Refs that aren't among `known` are dropped.
 */
export function parseUnderstanding(
  answer: string,
  known: ReadonlySet<string>,
  max = MAX_UNKNOWNS_PER_SEARCH,
): Understanding {
  const json = jsonFrom(answer) as Record<string, unknown> | undefined;
  const unknowns: Unknown[] = [];
  for (const u of list(json?.unknowns)) {
    const term = text(u.term);
    let question = text(u.question);
    if (!term || !question) continue;
    if (!question.includes(term)) question = `${question}（指「${term}」）`;
    if (unknowns.some((other) => other.term === term)) continue;
    unknowns.push({
      question,
      term,
      kind: KINDS.includes(u.kind as UnknownKind) ? (u.kind as UnknownKind) : '其他',
      why: text(u.why),
      refs: knownRefs(u.refs, known),
    });
  }
  const opinions: OpinionPoint[] = list(json?.opinions).flatMap((o) => {
    const point = text(o.point);
    const refs = knownRefs(o.refs, known);
    if (!point || !refs.length) return [];
    const counter = text(o.counter) || null;
    return [{ point, counter, refs, counterRefs: counter ? knownRefs(o.counterRefs, known) : [] }];
  });
  const claims: Claim[] = list(json?.claims).flatMap((c) => {
    const claim = text(c.claim);
    const refs = knownRefs(c.refs, known);
    return claim && refs.length ? [{ claim, refs }] : [];
  });
  return { unknowns: unknowns.slice(0, max), opinions, claims };
}

/** The distinct posts a set of refs point into. */
export function postsOf(refs: readonly string[]): string[] {
  return [...new Set(refs.map(postOfRef))];
}
