/** The words in a forbidden-words list (forbidden-words.md): each `- ` line is one; the rest is notes. */
export function forbiddenWordsOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => /^\s*[-*]\s+(.+?)\s*$/.exec(line)?.[1] ?? [])
    .filter(Boolean);
}

/** Which of `words` appear in `text`. */
export function forbiddenIn(text: string, words: readonly string[]): string[] {
  return words.filter((word) => text.includes(word));
}
