import {
  memoryLength,
  serialiseEntries,
  withoutTrailerLines,
  type Author,
  type Entry,
} from './entry';

/**
 * One change to a memory file: `add` a new entry at the end, `replace` the one place the text
 * says `old` with `content`, or `remove` the entry that says `old`.
 */
export type Change =
  | { action: 'add'; content: string }
  | { action: 'replace'; old: string; content: string }
  | { action: 'remove'; old: string };

/** Who made a change and on what day, which the entries it writes are stamped with. */
export interface Stamp {
  at: string;
  by: Author;
}

/** An entry a change took out: what it said and when and by whom it was written. */
export interface Retired {
  entry: Entry;
  action: 'replace' | 'remove';
}

/**
 * `entries` with `change` made, stamped with `stamp` when it writes one, and the entry it took out
 * if any; or, when it can't be made, what's wrong in words for Claude: `old` found nowhere or in
 * more than one place, or the result over `limit` characters (then it says to merge or remove
 * entries first). A `§` in `content` stays inside the entry, as text.
 */
export function applyChange(
  entries: readonly Entry[],
  change: Change,
  limit: number,
  stamp?: Stamp,
): { entries: Entry[]; retired?: Retired } | { error: string } {
  const content = 'content' in change ? withoutTrailerLines(change.content).trim() : '';
  if (change.action !== 'remove' && !content) return { error: 'content 是空的' };
  const written = (text: string): Entry => ({ text, ...stamp });
  let next: Entry[];
  let retired: Retired | undefined;
  if (change.action === 'add') {
    next = [...entries, written(content)];
  } else {
    const old = change.old.trim();
    if (!old) return { error: 'old 是空的：填要改或删的那条里的一段原文' };
    const found = entries.flatMap((entry, i) => (entry.text.includes(old) ? [i] : []));
    if (!found.length) return { error: `没找到「${old}」：照现在记着的原文抄一段` };
    const at = found[0]!;
    const entry = entries[at]!;
    if (found.length > 1 || entry.text.split(old).length > 2) {
      return { error: `「${old}」出现在不止一处：多抄一点，让它只对得上一处` };
    }
    next = [...entries];
    retired = { entry, action: change.action };
    if (change.action === 'remove') next.splice(at, 1);
    else next[at] = written(entry.text.replace(old, () => content).trim());
  }
  next = next.filter((entry) => entry.text);
  const length = memoryLength(serialiseEntries(next));
  if (change.action !== 'remove' && length > limit) {
    return {
      error: `写不下：改完有 ${length} 字，上限 ${limit} 字。先把相近的几条合并成一条、删掉过时的，再写`,
    };
  }
  return { entries: next, retired };
}

/**
 * `entries` with each of `changes` made in turn (see applyChange): one that can't be made is
 * skipped, with why in `skipped`, and the rest still are. `permit` says why a change isn't
 * allowed, given the entries as they are by then, or nothing when it is.
 */
export function applyChanges(
  entries: readonly Entry[],
  changes: readonly Change[],
  limit: number,
  stamp?: Stamp,
  permit: (change: Change, entries: readonly Entry[]) => string | undefined = () => undefined,
): {
  entries: Entry[];
  made: Change[];
  retired: Retired[];
  skipped: { change: Change; why: string }[];
} {
  const made: Change[] = [];
  const retired: Retired[] = [];
  const skipped: { change: Change; why: string }[] = [];
  let current = [...entries];
  for (const change of changes) {
    const refused = permit(change, current);
    const changed = refused ? { error: refused } : applyChange(current, change, limit, stamp);
    if ('error' in changed) {
      skipped.push({ change, why: changed.error });
    } else {
      current = changed.entries;
      made.push(change);
      if (changed.retired) retired.push(changed.retired);
    }
  }
  return { entries: current, made, retired, skipped };
}
