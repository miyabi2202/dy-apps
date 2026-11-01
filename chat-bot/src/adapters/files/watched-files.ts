import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowseThoughts, Watched } from '../../app/ports';

/**
 * What the browsing account watched, in `dir` (data/browse/watched/): `<YYYY-MM-DD>.md`, the
 * `- 看了 …` lines `pnpm browse --feed` appends, each ending in an `[id:…]` that is left off here.
 * Read on every use; a day with no file has no lines.
 */
export function watchedFiles(dir: string): Watched {
  return dayLines(dir);
}

/**
 * Her thoughts from browsing, in `dir` (data/browse/thoughts/): `<YYYY-MM-DD>.md`, the `- …` lines
 * `pnpm browse` appends after a run (her reflection), read the same way as what she watched.
 */
export function browseThoughtsFiles(dir: string): BrowseThoughts {
  return dayLines(dir);
}

/** A folder of `<YYYY-MM-DD>.md` files of `- … [id:…]` lines, the ids left off. */
function dayLines(dir: string): Watched {
  const day = (date: string): string[] => {
    try {
      return readFileSync(join(dir, `${date}.md`), 'utf8')
        .split(/\r?\n/)
        .flatMap((line) => /^- (.+)$/.exec(line.trim())?.[1] ?? [])
        .map((line) => line.replace(/\s*\[id:[^\]]*\]\s*$/, '').trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  return {
    recent: (dates, limit) => [...dates].sort().flatMap(day).slice(-limit),
  };
}
