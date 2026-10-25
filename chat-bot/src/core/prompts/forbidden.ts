import { wordingSections } from './wording';

/** Words Douyin holds back a message for, each with what to write instead ('' for `*`s). */
export type ForbiddenWords = Readonly<Record<string, string>>;

/**
 * forbidden-words.json: an object of word to what to write instead. A value that isn't a string
 * counts as ''. Throws when it isn't a JSON object.
 */
export function forbiddenWordsOf(json: string): ForbiddenWords {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('forbidden-words.json is not an object of word to replacement');
  }
  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([word]) => word)
      .map(([word, instead]) => [word, typeof instead === 'string' ? instead : '']),
  );
}

/**
 * `text` with each of `words` in it swapped for what to write instead, or for as many `*` as it
 * has characters when that's ''. Longer words first, so `哔哩哔哩` isn't cut up by a shorter one.
 */
export function withoutForbidden(text: string, words: ForbiddenWords = {}): string {
  const longestFirst = Object.keys(words).sort((a, b) => b.length - a.length);
  if (!longestFirst.length) return text;
  const pattern = new RegExp(
    longestFirst.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'g',
  );
  return text.replace(pattern, (word) => words[word] || '*'.repeat([...word].length));
}

/** The rules for topics in forbidden.md, its `## Topics` section as it is; empty without one. */
export function forbiddenTopicsOf(text: string): string {
  return wordingSections(text).get('Topics') ?? '';
}
