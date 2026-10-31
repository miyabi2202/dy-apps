import { syllables } from '../viewers/sounds-like';

/**
 * How much the pinyin match counts next to the meaning: `(1 − w) × cosine + w × pinyin`. Small,
 * since more lets sound outvote meaning (at 0.3 chat-bot/embedding-eval's 「related」 queries
 * dropped from 83% to 50% right), yet enough to pull up a word the recognizer or a typo got wrong
 * (三角洲 heard as 酸角粥). Picked on that small test set: a "small" weight, not a tuned constant.
 */
export const PINYIN_WEIGHT = 0.1;

/** What a pinyin BM25 score is divided by (and capped at 1) to sit beside a cosine: the 99th percentile of the eval's. */
export const PINYIN_SCALE = 6.4;

/** The dot product of two vectors: their cosine similarity, since the service normalizes them. */
export function similarity(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += a[i]! * b[i]!;
  return sum;
}

const CJK = /[一-鿿]+/g;
const ASCII_WORD = /[A-Za-z0-9]+/g;

/**
 * What a text sounds like, to match words that sound alike but are written differently: each run
 * of Chinese as pairs of toneless syllables, mixed-up sounds merged (see syllables; a lone character
 * is one syllable), and each ASCII word lowercased.
 */
export function pinyinTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const run of text.match(CJK) ?? []) {
    const syls = syllables(run);
    if (syls.length === 1) tokens.push(syls[0]!);
    for (let i = 0; i + 1 < syls.length; i++) tokens.push(`${syls[i]} ${syls[i + 1]}`);
  }
  for (const word of text.match(ASCII_WORD) ?? []) tokens.push(word.toLowerCase());
  return tokens;
}

/** BM25 over what `docs` sound like: how well each matches a query's sounds, 0 for none. */
export function pinyinScores(docs: readonly string[], query: string): number[] {
  const k1 = 1.2;
  const b = 0.75;
  const counts = docs.map((doc) => {
    const count = new Map<string, number>();
    for (const token of pinyinTokens(doc)) count.set(token, (count.get(token) ?? 0) + 1);
    return count;
  });
  const lengths = counts.map((count) => [...count.values()].reduce((a, c) => a + c, 0));
  const average = lengths.reduce((a, c) => a + c, 0) / (lengths.length || 1) || 1;
  const df = new Map<string, number>();
  for (const count of counts)
    for (const token of count.keys()) df.set(token, (df.get(token) ?? 0) + 1);
  const terms = new Set(pinyinTokens(query));
  return counts.map((count, i) => {
    let score = 0;
    for (const term of terms) {
      const f = count.get(term);
      if (!f) continue;
      const n = df.get(term)!;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * lengths[i]!) / average));
    }
    return score;
  });
}

/** The meaning and the sound together: `(1 − weight) × cosine + weight × min(1, pinyin / scale)`. */
export function combinedScore(
  cosine: number,
  pinyin: number,
  { weight = PINYIN_WEIGHT, scale = PINYIN_SCALE } = {},
): number {
  return (1 - weight) * cosine + weight * Math.min(1, pinyin / scale);
}

/**
 * Which items come to mind, by their `scores`: those at least `cutoff`, the highest first, at most
 * `max`; their indexes, oldest first, as a prompt shows them.
 */
export function recalled(
  scores: readonly number[],
  { cutoff, max }: { cutoff: number; max: number },
): number[] {
  return scores
    .map((score, index) => ({ index, score }))
    .filter(({ score }) => score >= cutoff)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ index }) => index)
    .sort((a, b) => a - b);
}

/** `text` without the bot's own names (any case), so its name doesn't match a memory that only mentions it. */
export function withoutNames(text: string, names: readonly string[]): string {
  let out = text;
  for (const name of names.filter((n) => n.trim())) {
    out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  }
  return out;
}

/**
 * What's being said in the room now, as recall looks for memories that fit it: the streamer's last
 * few lines and the last few chats, a line each, the newest last, at most `maxChars` (the oldest
 * dropped first).
 */
export function recallQuery(
  speech: readonly string[],
  chat: readonly string[],
  { speechLines = 6, chatLines = 8, maxChars = 600 } = {},
): string {
  const lines = [...speech.slice(-speechLines), ...chat.slice(-chatLines)]
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  while (lines.length > 1 && lines.join('\n').length > maxChars) lines.shift();
  return lines.join('\n').slice(-maxChars);
}
