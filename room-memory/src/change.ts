import { memoryLength, parseEntries, serialiseEntries, type Entry } from './entry';

/**
 * One change to a memory file: `add` a new entry at the end, `replace` the one place the text
 * says `old` with `content`, or `remove` the entry that says `old`.
 */
export type Change =
  | { action: 'add'; content: string }
  | { action: 'replace'; old: string; content: string }
  | { action: 'remove'; old: string };

/**
 * `text` with `change` made, or, when it can't be made, what's wrong in words for Claude: `old`
 * found nowhere or in more than one place, or the result over `limit` characters (then it says to
 * merge or remove entries first). A `§` in `content` stays inside the entry, as text.
 */
export function applyChange(
  text: string,
  change: Change,
  limit: number,
): { text: string } | { error: string } {
  const entries = parseEntries(text).map((entry) => entry.text);
  const content = 'content' in change ? change.content.trim() : '';
  if (change.action !== 'remove' && !content) return { error: 'content 是空的' };
  let next: string[];
  if (change.action === 'add') {
    next = [...entries, content];
  } else {
    const old = change.old.trim();
    if (!old) return { error: 'old 是空的：填要改或删的那条里的一段原文' };
    const found = entries.flatMap((entry, i) => (entry.includes(old) ? [i] : []));
    if (!found.length) return { error: `没找到「${old}」：照现在记着的原文抄一段` };
    if (found.length > 1 || entries[found[0]!]!.split(old).length > 2) {
      return { error: `「${old}」出现在不止一处：多抄一点，让它只对得上一处` };
    }
    const at = found[0]!;
    next = [...entries];
    if (change.action === 'remove') next.splice(at, 1);
    else next[at] = next[at]!.replace(old, () => content).trim();
  }
  const result = serialiseEntries(next.filter(Boolean).map((entry) => ({ text: entry })));
  const length = memoryLength(result);
  if (change.action !== 'remove' && length > limit) {
    return {
      error: `写不下：改完有 ${length} 字，上限 ${limit} 字。先把相近的几条合并成一条、删掉过时的，再写`,
    };
  }
  return { text: result };
}

/**
 * `text` with each of `changes` made in turn (see applyChange): one that can't be made is
 * skipped, with why in `skipped`, and the rest still are. `permit` says why a change isn't
 * allowed, given the entries as they are by then, or nothing when it is.
 */
export function applyChanges(
  text: string,
  changes: readonly Change[],
  limit: number,
  permit: (change: Change, entries: readonly Entry[]) => string | undefined = () => undefined,
): { text: string; made: Change[]; skipped: { change: Change; why: string }[] } {
  const made: Change[] = [];
  const skipped: { change: Change; why: string }[] = [];
  for (const change of changes) {
    const refused = permit(change, parseEntries(text));
    const changed = refused ? { error: refused } : applyChange(text, change, limit);
    if ('error' in changed) {
      skipped.push({ change, why: changed.error });
    } else {
      text = changed.text;
      made.push(change);
    }
  }
  return { text, made, skipped };
}
