/** `2026-11-01`, the local date of a time in ms. */
export function dateOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The JSON in a model's answer: the text as JSON, or the first fenced block, or what's between the
 * first opening bracket and the last closing one. Undefined when there is none.
 */
export function jsonFrom(text: string): unknown {
  const candidates = [text.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  if (fenced) candidates.push(fenced.trim());
  for (const [open, close] of [
    ['[', ']'],
    ['{', '}'],
  ] as const) {
    const from = text.indexOf(open);
    const to = text.lastIndexOf(close);
    if (from >= 0 && to > from) candidates.push(text.slice(from, to + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // try the next
    }
  }
  return undefined;
}

/** `text` cut to `max` characters (not bytes), with … when cut. */
export function clip(text: string, max: number): string {
  const chars = [...text.replace(/\s+/g, ' ').trim()];
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max).join('')}…`;
}
