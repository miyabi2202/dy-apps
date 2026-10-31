import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Thoughts } from '../../app/ports';

/**
 * The bot's thoughts after each stream, in `path` (the room's memory/thoughts.md): one a line,
 * `2026-10-31：…`, appended and never rewritten, so a hand edit stays.
 */
export function thoughtsFile(path: string): Thoughts {
  return {
    recent(count) {
      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        return '';
      }
      return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-count)
        .join('\n');
    },
    add(date, entries) {
      // One line an entry, so a line break in one can't start another.
      const lines = entries
        .map((entry) => entry.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((entry) => `${date}：${entry}\n`);
      if (!lines.length) return;
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, lines.join(''));
    },
  };
}
