/** A term as compared for sameness: lowercase, no spaces, quotes, bold marks or punctuation. */
export function termKey(term: string): string {
  return term.toLowerCase().replace(/[\s*「」『』"'“”‘’《》？?！!，,。.、：:]/g, '');
}

/** Whether two terms are the same thing to look up: equal, or one holds the other (two characters or more). */
export function sameTerm(a: string, b: string): boolean {
  const [x, y] = [termKey(a), termKey(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 2 && long.includes(short);
}
