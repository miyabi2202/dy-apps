/** The line between two entries of a memory file. */
const SEPARATOR = '§';

/** Who wrote an entry: Claude answering someone (`tool`), or `pnpm remember` (`chat`). */
export type Author = 'tool' | 'chat';

/** One thing a memory file remembers, and, when the module wrote it, when and by whom. */
export interface Entry {
  text: string;
  /** The day it was written, `YYYY-MM-DD`; none for what was in the file before dates. */
  at?: string;
  by?: Author;
}

/** The last line of an entry the module wrote: `<!-- 2026-10-30 tool -->`. */
const TRAILER = /^<!-- (\d{4}-\d{2}-\d{2}) (tool|chat) -->[ \t]*$/;

/** A memory file's entries, in order: the text between `§` lines, each trimmed, empty ones left out. */
export function parseEntries(text: string): Entry[] {
  return text
    .split(/^[ \t]*§[ \t]*$/m)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const lines = entry.split('\n');
      const trailer = TRAILER.exec(lines[lines.length - 1]!.trim());
      if (!trailer) return { text: entry };
      return {
        text: lines.slice(0, -1).join('\n').trim(),
        at: trailer[1]!,
        by: trailer[2] as Author,
      };
    })
    .filter((entry) => entry.text);
}

/** `entries` as a memory file, a `§` line between each two and a trailer line on those with a date. */
export function serialiseEntries(entries: readonly Entry[]): string {
  const lines = entries.map((entry) =>
    entry.at && entry.by ? `${entry.text}\n<!-- ${entry.at} ${entry.by} -->` : entry.text,
  );
  return lines.length ? `${lines.join(`\n${SEPARATOR}\n`)}\n` : '';
}

/**
 * `text` as a prompt has it: the file without the trailer lines. A file with none is the same
 * text, byte for byte.
 */
export function withoutTrailers(text: string): string {
  return text.replace(/^<!-- \d{4}-\d{2}-\d{2} (?:tool|chat) -->[ \t]*(?:\r?\n|$)/gm, '');
}

/**
 * `text` with any line that is only a `§` joined onto the line before it (or the line after, when
 * there is none before), so what's written can't split into two entries when the file is read
 * back. Empty when `text` is nothing but such lines: that can't be an entry.
 */
export function withoutSeparatorLines(text: string): string {
  const joined: string[] = [];
  let lead = '';
  for (const line of text.split('\n')) {
    if (!/^[ \t]*§[ \t]*$/.test(line)) {
      joined.push(lead + line);
      lead = '';
    } else if (joined.length) {
      joined[joined.length - 1] += ' §';
    } else {
      lead += '§ ';
    }
  }
  return joined.join('\n');
}

/** `text` with any line that looks like a trailer taken out, so what's written can't pass for one. */
export function withoutTrailerLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !TRAILER.test(line.trim()))
    .join('\n');
}

/** How long a memory file is, in characters as the limit counts them (trailer lines aren't). */
export function memoryLength(text: string): number {
  return [...withoutTrailers(text).trim()].length;
}
