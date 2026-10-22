import { syllables } from '../viewers/sounds-like';

/** A chat message the streamer may read out. */
export interface ReadableChat {
  nickname: string;
  content: string;
}

/** The marker put where the streamer read out someone's chat. */
export function readMark(nickname: string): string {
  return `（念了${nickname}的弹幕）`;
}

/**
 * What the streamer said in `text` themselves: every stretch that reads out one of `chats` (as
 * heard, so misheard, missing and extra syllables are fine) becomes readMark(nickname), so the
 * streamer reading the room's chat aloud, as many do, isn't taken for them saying it. Null when
 * reading is all there was.
 */
export function unread(text: string, chats: readonly ReadableChat[]): string | null {
  const candidates = chats
    .map((chat) => ({ nickname: chat.nickname, heard: syllables(spoken(chat.content)) }))
    .filter(({ heard }) => heard.length >= MIN_MATCH);
  const readers: string[] = [];
  // Matched chats can be found again in shorter bits, as a streamer reads a long one in parts.
  const found = new Set<number>();
  let rest = text;
  for (;;) {
    const said = sayings(rest);
    let best: { at: number; match: Match } | null = null;
    candidates.forEach(({ heard }, at) => {
      const match = align(
        said.map((s) => s.syllable),
        heard,
      );
      if (isReading(match, heard.length, found.has(at)) && (!best || match.n > best.match.n)) {
        best = { at, match };
      }
    });
    if (!best) break;
    const { at, match } = best as { at: number; match: Match };
    const from = said[match.start]!.index;
    const to = said[match.end - 1]!.index + 1;
    // A mark without Chinese, so it isn't matched again; named once everything's found.
    rest = `${rest.slice(0, from)}<${readers.push(candidates[at]!.nickname) - 1}>${rest.slice(to)}`;
    found.add(at);
  }
  if (!readers.length) return text;
  if (sayings(rest.replace(/<\d+>/g, '')).length < MIN_OWN) return null;
  return rest
    .replace(/<(\d+)>/g, (_, id: string) => readMark(readers[Number(id)]!))
    .replace(/(（念了[^（）]*?的弹幕）)\1+/g, '$1');
}

/** The fewest syllables that count as reading out a chat. */
const MIN_MATCH = 3;
/** The fewest syllables of their own the streamer must say besides reading for it to count. */
const MIN_OWN = 2;

/** A chat as it would be read out: without the leading @昵称 and a long reply's (1/2). */
function spoken(content: string): string {
  return content.replace(/^@\S+\s/, '').replace(/^\(\d+\/\d+\) /, '');
}

/**
 * Each Chinese character's syllable and where it is in `text`, worked out from the whole text so
 * 了 in 来了 is le, not liao.
 */
function sayings(text: string): { syllable: string; index: number }[] {
  const heard = syllables(text);
  const han = [...text].flatMap((ch, index) => (/\p{Script=Han}/u.test(ch) ? [index] : []));
  if (heard.length === han.length)
    return heard.map((syllable, k) => ({ syllable, index: han[k]! }));
  return [...text].flatMap((ch, index) => syllables(ch).map((syllable) => ({ syllable, index })));
}

interface Match {
  /** How many syllables are the same. */
  n: number;
  /** Where the stretch starts and ends in the streamer's syllables. */
  start: number;
  end: number;
}

/**
 * Whether `match` is reading out a chat of `length` syllables: mostly the same syllables, and most
 * of a short chat or a long enough stretch of a long one (a bot reply is often read in part).
 * Once the chat was found, any 4 syllables of it count.
 */
function isReading(match: Match, length: number, found: boolean): boolean {
  if (match.n < 0.75 * (match.end - match.start)) return false;
  if (found) return match.n >= 4;
  return (
    match.n >= MIN_MATCH && match.n >= Math.min(length, 4) && match.n >= Math.min(0.6 * length, 8)
  );
}

const MATCH = 2;
const MISMATCH = -2;
const GAP = -2;

/**
 * Smith-Waterman local alignment of `a` with `b`: the best-scoring stretch of `a` that says part
 * of `b`, allowing a misheard, missing or extra syllable now and then.
 */
function align(a: readonly string[], b: readonly string[]): Match {
  const score = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  let best = { score: 0, i: 0, j: 0 };
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const s = Math.max(
        0,
        score[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? MATCH : MISMATCH),
        score[i - 1]![j]! + GAP,
        score[i]![j - 1]! + GAP,
      );
      score[i]![j] = s;
      if (s > best.score) best = { score: s, i, j };
    }
  }
  // Walk back to where the stretch starts, counting the same syllables.
  let { i, j } = best;
  let n = 0;
  while (i > 0 && j > 0 && score[i]![j]! > 0) {
    const s = score[i]![j]!;
    const same = a[i - 1] === b[j - 1];
    if (s === score[i - 1]![j - 1]! + (same ? MATCH : MISMATCH)) {
      if (same) n++;
      i--;
      j--;
    } else if (s === score[i - 1]![j]! + GAP) i--;
    else j--;
  }
  return { n, start: i, end: best.i };
}
