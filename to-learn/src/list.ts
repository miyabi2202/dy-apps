import { termKey } from './term';

/**
 * The to-learn list: a Markdown checklist of things the bot doesn't know yet. An item is
 *
 *     - [ ] <term> — <question>（<where it came from>）
 *     - [x] <term> — <question>（<where it came from>）→ <what came of it>
 *
 * Every other line (headings, notes, blank lines, a person's free text) is kept as it is when the
 * file is rewritten. Read leniently (a `-` or `：` for the `—`, a missing `（…）`, a bold term), written
 * strictly (formatItem).
 */
export interface ToLearnItem {
  /** What to search for it. */
  term: string;
  /** A question that stands on its own. */
  question: string;
  /** Where it came from (`刷抖音时好奇 2026-11-01`, `直播 2026-11-02`, `手写`); empty when the line has none. */
  from: string;
  done: boolean;
  /** What came of it, once done. */
  outcome?: string;
  /** The item's line in the file (0-based). */
  line: number;
  /** The indented lines right under it: context a person wrote. */
  notes: string[];
}

/** An item to add: what a run or a person wants learned. */
export interface NewItem {
  term: string;
  question: string;
  from: string;
}

export interface ToLearn {
  /** The file's lines, as they are. */
  lines: string[];
  items: ToLearnItem[];
}

/** The heading new items go under. */
export const TO_LEARN_HEADING = '## 待学';

const ITEM = /^[-*]\s+\[([ xX])\]\s+(.*)$/;
const OUTCOME = /\s*(?:→|->)\s*/;
/** Between the term and the question: an em dash (spaced or not), or a spaced `-`/`–`/`--`. */
const SEPARATOR = /\s*(?:——|—)\s*|\s+(?:–|--?)\s+/;

/** The file's items, with its lines kept for a lossless rewrite. */
export function parseToLearn(text: string): ToLearn {
  const lines = text.split('\n');
  const items: ToLearnItem[] = [];
  lines.forEach((raw, index) => {
    const last = items.at(-1);
    if (last && /^\s+\S/.test(raw) && index === last.line + 1 + last.notes.length) {
      last.notes.push(raw.trim());
      return;
    }
    const match = ITEM.exec(raw.trimEnd());
    if (!match) return;
    const item = parseBody(match[2]!);
    if (!item.term) return;
    items.push({ ...item, done: match[1] !== ' ', line: index, notes: [] });
  });
  return { lines, items };
}

function parseBody(body: string): Omit<ToLearnItem, 'done' | 'line' | 'notes'> {
  let rest = body.trim();
  let outcome: string | undefined;
  const arrow = OUTCOME.exec(rest);
  if (arrow) {
    outcome = rest.slice(arrow.index + arrow[0].length).trim() || undefined;
    rest = rest.slice(0, arrow.index).trim();
  }
  let from = '';
  const source = /[（(]([^（）()]*)[）)]$/.exec(rest);
  if (source) {
    from = source[1]!.trim();
    rest = rest.slice(0, source.index).trim();
  }
  let term = rest;
  let question = '';
  const separator = SEPARATOR.exec(rest) ?? /\s*[：:]\s*/.exec(rest);
  if (separator) {
    term = rest.slice(0, separator.index);
    question = rest.slice(separator.index + separator[0].length).trim();
  }
  return { term: cleanTerm(term), question, from, ...(outcome ? { outcome } : {}) };
}

function cleanTerm(term: string): string {
  return term
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** An item's line, in the strict format. */
export function formatItem(item: NewItem & { done?: boolean; outcome?: string }): string {
  const term = cleanTerm(item.term);
  const question = oneLine(item.question) || `「${term}」是什么？`;
  const from = oneLine(item.from);
  const line = `- [${item.done ? 'x' : ' '}] ${term} — ${question}${from ? `（${from}）` : ''}`;
  return item.done && item.outcome ? withOutcome(line, item.outcome) : line;
}

/** `→ outcome` after a line: right after its `）`, else after a space. */
function withOutcome(line: string, outcome: string): string {
  return `${line}${/[）)]$/.test(line) ? '' : ' '}→ ${oneLine(outcome)}`;
}

/** The items not done yet, in file order. */
export function openItems(text: string): ToLearnItem[] {
  return parseToLearn(text).items.filter((item) => !item.done);
}

export interface AddOptions {
  /** A term the bot already knows (the knowledge base, a search already made): not added. */
  known?: (term: string) => boolean;
  /** The most added at once. */
  max?: number;
}

/**
 * The ones of `wanted` that `addItems` adds: not about a term any item of the file has (open or
 * done), not `known`, each term once, at most `max`.
 */
export function itemsToAdd(
  text: string,
  wanted: readonly NewItem[],
  { known = () => false, max = Infinity }: AddOptions = {},
): NewItem[] {
  const taken = new Set(parseToLearn(text).items.map((item) => termKey(item.term)));
  const out: NewItem[] = [];
  for (const item of wanted) {
    if (out.length >= max) break;
    const key = termKey(item.term);
    if (!key || taken.has(key) || known(item.term)) continue;
    taken.add(key);
    out.push(item);
  }
  return out;
}

/** The text with the new items (itemsToAdd) at the end of the `## 待学` section, made if missing. */
export function addItems(text: string, wanted: readonly NewItem[], options?: AddOptions): string {
  const adding = itemsToAdd(text, wanted, options).map((item) => formatItem(item));
  if (!adding.length) return text;
  const lines = text.replace(/\n$/, '').split('\n');
  if (lines.length === 1 && lines[0] === '') lines.pop();
  let heading = lines.findIndex((line) => line.trim() === TO_LEARN_HEADING);
  if (heading < 0) {
    while (lines.length && !lines.at(-1)!.trim()) lines.pop();
    if (lines.length) lines.push('');
    lines.push(TO_LEARN_HEADING);
    heading = lines.length - 1;
  }
  let end = lines.findIndex((line, i) => i > heading && /^#{1,2}\s/.test(line));
  if (end < 0) end = lines.length;
  const body = lines.slice(heading + 1, end);
  while (body.length && !body.at(-1)!.trim()) body.pop();
  if (!body.length) body.push('');
  const after = lines.slice(end);
  return (
    [
      ...lines.slice(0, heading + 1),
      ...body,
      ...adding,
      ...(after.length ? ['', ...after] : []),
    ].join('\n') + '\n'
  );
}

/**
 * The text with the first open item about `term` ticked and `→ outcome` added to its line; the rest
 * of the line, as a person wrote it, stays. Unchanged when no open item has that term.
 */
export function markDone(text: string, term: string, outcome: string): string {
  const { lines, items } = parseToLearn(text);
  const key = termKey(term);
  const item = items.find((i) => !i.done && termKey(i.term) === key);
  if (!item) return text;
  lines[item.line] = withOutcome(lines[item.line]!.trimEnd().replace(/\[ \]/, '[x]'), outcome);
  return lines.join('\n');
}
