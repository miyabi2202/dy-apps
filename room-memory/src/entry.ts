/** The line between two entries of a memory file. */
const SEPARATOR = '§';

/** One thing a memory file remembers. */
export interface Entry {
  text: string;
}

/** A memory file's entries, in order: the text between `§` lines, each trimmed, empty ones left out. */
export function parseEntries(text: string): Entry[] {
  return text
    .split(/^[ \t]*§[ \t]*$/m)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => ({ text: entry }));
}

/** `entries` as a memory file, a `§` line between each two. */
export function serialiseEntries(entries: readonly Entry[]): string {
  return entries.length ? `${entries.map((entry) => entry.text).join(`\n${SEPARATOR}\n`)}\n` : '';
}

/** How long a memory file is, in characters as the limit counts them. */
export function memoryLength(text: string): number {
  return [...text.trim()].length;
}
