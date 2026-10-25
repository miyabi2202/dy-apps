import { wordingSections } from './wording';

/**
 * The words in forbidden.md: each `- ` line in its `## Words` section (under any `###` heading) is
 * one; the rest is notes.
 */
export function forbiddenWordsOf(text: string): string[] {
  return (wordingSections(text).get('Words') ?? '')
    .split(/\r?\n/)
    .flatMap((line) => /^\s*[-*]\s+(.+?)\s*$/.exec(line)?.[1] ?? [])
    .filter(Boolean);
}

/** The rules for topics in forbidden.md, its `## Topics` section as it is; empty without one. */
export function forbiddenTopicsOf(text: string): string {
  return wordingSections(text).get('Topics') ?? '';
}

/** Which of `words` appear in `text`. */
export function forbiddenIn(text: string, words: readonly string[]): string[] {
  return words.filter((word) => text.includes(word));
}
