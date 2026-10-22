import { cleanLine } from './normalise';
import type { SungLine } from './types';

/** A search text is cut here (code points). */
const CAP = 20;
/** A Latin line may run a little over the cap so the cut falls between words. */
const LATIN_SLACK = 12;

/** The lines that were sung, as plain text. */
export function sungTexts(lines: readonly SungLine[]): string[] {
  return lines.flatMap((line) =>
    typeof line === 'string' ? [line] : line.sung === false ? [] : [line.text],
  );
}

function cap(line: string): string {
  const points = [...line];
  if (points.length <= CAP || !/[a-zA-Z] [a-zA-Z]/.test(line)) return points.slice(0, CAP).join('');
  const cut = points.slice(0, CAP + LATIN_SLACK).join('');
  const at = cut.lastIndexOf(' ');
  return at < 0 ? cut : cut.slice(0, at);
}

/**
 * The lines to search: the longest few distinct ones, since a long line names its song far more
 * often than a short one. Pairs of lines made it worse, so each is searched alone.
 */
export function lyricQueries(lines: readonly SungLine[], max = 5): string[] {
  const usable = sungTexts(lines)
    .map(cleanLine)
    .filter((line) => [...line.replace(/ /g, '')].length >= 4);
  const longestFirst = [...new Set(usable)]
    .map((line, order) => ({ line, order, length: [...line].length }))
    .sort((a, b) => b.length - a.length || a.order - b.order);
  return [...new Set(longestFirst.slice(0, max).map((x) => cap(x.line)))];
}
