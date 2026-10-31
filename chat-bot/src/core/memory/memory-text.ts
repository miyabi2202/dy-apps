/** The line between two entries of a memory file. */
const SEPARATOR = '§';

/** The most characters the room's memory.md may hold. */
export const ROOM_MEMORY_LIMIT = 4000;

/** The most characters one viewer's note.md may hold. */
export const NOTE_LIMIT = 1000;

/** The most characters the streamer's note.md may hold: more than a viewer's, since it's in every prompt, like memory.md. */
export const STREAMER_NOTE_LIMIT = 2000;

/** A memory file's entries, in order: the text between `§` lines, each trimmed, empty ones left out. */
export function entriesOf(text: string): string[] {
  return text
    .split(/^[ \t]*§[ \t]*$/m)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** `entries` as a memory file, a `§` line between each two. */
export function memoryText(entries: readonly string[]): string {
  return entries.length ? `${entries.join(`\n${SEPARATOR}\n`)}\n` : '';
}

/** How long a memory file is, in characters as the limit counts them. */
export function memoryLength(text: string): number {
  return [...text.trim()].length;
}

/**
 * One change to a memory file: `add` a new entry at the end, `replace` the one place the text
 * says `old` with `content`, or `remove` the entry that says `old`.
 */
export type MemoryChange =
  | { action: 'add'; content: string }
  | { action: 'replace'; old: string; content: string }
  | { action: 'remove'; old: string };

/**
 * `text` with `change` made, or, when it can't be made, what's wrong in words for Claude: `old`
 * found nowhere or in more than one place, or the result over `limit` characters (then it says to
 * merge or remove entries first). A `§` in `content` stays inside the entry, as text.
 */
export function changeMemory(
  text: string,
  change: MemoryChange,
  limit: number,
): { text: string } | { error: string } {
  const entries = entriesOf(text);
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
  const result = memoryText(next.filter(Boolean));
  const length = memoryLength(result);
  if (change.action !== 'remove' && length > limit) {
    return {
      error: `写不下：改完有 ${length} 字，上限 ${limit} 字。先把相近的几条合并成一条、删掉过时的，再写`,
    };
  }
  return { text: result };
}

/**
 * `text` with each of `changes` made in turn (see changeMemory): one that can't be made is
 * skipped, with why in `skipped`, and the rest still are.
 */
export function changeMemoryAll(
  text: string,
  changes: readonly MemoryChange[],
  limit: number,
): { text: string; made: MemoryChange[]; skipped: { change: MemoryChange; why: string }[] } {
  const made: MemoryChange[] = [];
  const skipped: { change: MemoryChange; why: string }[] = [];
  for (const change of changes) {
    const changed = changeMemory(text, change, limit);
    if ('error' in changed) {
      skipped.push({ change, why: changed.error });
    } else {
      text = changed.text;
      made.push(change);
    }
  }
  return { text, made, skipped };
}
