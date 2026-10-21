/** Douyin's chat length limit, in characters. */
export const DOUYIN_CHAT_LIMIT = 49;

/** Where a long reply would rather be cut: after the end of a sentence or clause. */
const BREAK_AFTER = new Set([...'。！？；，、：.!?;,: ）)】」']);

/**
 * `nickname` without the room's `prefixes` at its start (the symbols fans put before their name
 * for the streamer they back, 单推符号 like `⊹꙳𝝑`), each taken off as often as it's there, longest
 * first; for when the @ has to be shortened. The whole nickname when nothing would be left.
 */
export function atName(nickname: string, prefixes: readonly string[] = []): string {
  const longestFirst = [...prefixes].filter(Boolean).sort((a, b) => b.length - a.length);
  let name = nickname;
  for (let cut = true; cut;) {
    cut = false;
    for (const prefix of longestFirst) {
      if (name.startsWith(prefix)) {
        name = name.slice(prefix.length).trimStart();
        cut = true;
      }
    }
  }
  return name || nickname;
}

/**
 * The first 3 characters of a nickname, to @ someone when the whole name doesn't fit: of the name
 * without the room's 单推符号 (`trim`, see atName), so `@⊹꙳𝝑` isn't all that's left of it.
 */
function shortTag(nickname: string, trim: readonly string[] = []): string {
  return `@${[...atName(nickname, trim)].slice(0, 3).join('')}`;
}

/**
 * `@nickname text` as one message: with the whole nickname when that fits in `maxLength`,
 * otherwise with its first 3 characters (the @ is typed text, not a picked mention, so a short
 * one works as well); null when even that is too long.
 */
export function oneMessage(
  nickname: string,
  text: string,
  maxLength: number,
  trim: readonly string[] = [],
): string | null {
  for (const tag of [`@${nickname}`, shortTag(nickname, trim)]) {
    const message = `${tag} ${text}`;
    if ([...message].length <= maxLength) return message;
  }
  return null;
}

export interface ReplyLimits {
  /** Douyin's chat length limit, `@asker (1/5) ` included. */
  maxLength: number;
  /** A long answer is sent as up to this many messages. */
  maxParts: number;
  /** The room's 单推符号, taken off a nickname when the @ has to be shortened (see shortTag). */
  atTrimStart?: readonly string[];
}

/** The longest the text of one part may be: what the `@asker (9/9) ` prefix leaves. */
function partSize(asker: string, { maxLength, maxParts, atTrimStart }: ReplyLimits): number {
  return maxLength - [...`${shortTag(asker, atTrimStart)} (${maxParts}/${maxParts}) `].length;
}

/** How long an answer can be and still go out as one message (with the short @ if need be). */
export function singleBudget(asker: string, { maxLength, atTrimStart }: ReplyLimits): number {
  return maxLength - [...`${shortTag(asker, atTrimStart)} `].length;
}

/**
 * The most Claude may write when one message isn't enough: what fits in `maxParts` messages,
 * less a margin for the characters lost by cutting at punctuation rather than at the limit.
 */
export function answerBudget(asker: string, limits: ReplyLimits): number {
  const size = partSize(asker, limits);
  if (limits.maxParts <= 1 || size < 1) return singleBudget(asker, limits);
  return Math.max(singleBudget(asker, limits), Math.floor(size * limits.maxParts * 0.85));
}

/**
 * Claude's answer as chat messages for `asker`: one message when it fits (see oneMessage),
 * otherwise `@ask (1/3) …`, `@ask (2/3) …` with the nickname's first 3 characters, each within the limit and cut after punctuation where
 * possible, numbered so they read in order among other people's chat. Empty when Claude said
 * nothing; whatever doesn't fit in `maxParts` messages is cut off.
 */
export function replyMessages(asker: string, answer: string, limits: ReplyLimits): string[] {
  const short = shortTag(asker, limits.atTrimStart);
  const tags = [`@${asker}`, short];
  let text = oneLine(answer);
  // Claude sees the bot's earlier `@…` replies in the chat and often starts with the @ itself,
  // with the whole name or the short one.
  for (
    let tag = tags.find((t) => text.startsWith(t));
    tag;
    tag = tags.find((t) => text.startsWith(t))
  ) {
    text = text.slice(tag.length).trim();
  }
  if (!text) return [];

  const single = oneMessage(asker, text, limits.maxLength, limits.atTrimStart);
  if (single) return [single];
  const size = partSize(asker, limits);
  // When the numbering would leave no room for text, one message cut to the limit.
  if (limits.maxParts <= 1 || size < 1) {
    return [[...`${short} ${text}`].slice(0, limits.maxLength).join('')];
  }
  const parts = splitText(text, size, limits.maxParts);
  return parts.map((part, i) => `${short} (${i + 1}/${parts.length}) ${part}`);
}

/**
 * Where Claude is told to mark the message to send (`弹幕：…`), after whatever thinking it writes
 * first; bold (`**弹幕：**`) counts too. Other models put it after a sentence on the same line,
 * or at the very end, after the message; a 弹幕： inside a sentence isn't one.
 */
const MESSAGE_MARK =
  /(?:^|(?<=[。！？!?～~…]))[ \t]*\**弹幕\**[ \t]*[:：][ \t]*\**|\**弹幕\**[ \t]*[:：][ \t]*\**\s*$/g;

/**
 * What to send of Claude's answer: on the last line with a `弹幕：` mark, what follows the first
 * one, without any later ones (`弹幕：A！弹幕：B` is one message, A！B); when nothing follows it,
 * the last line before it. The whole answer when there's no mark.
 */
function marked(answer: string): string {
  const lines = answer.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    const [first] = line.matchAll(MESSAGE_MARK);
    if (!first) continue;
    const after = line
      .slice(first.index + first[0].length)
      .replace(MESSAGE_MARK, '')
      .trim();
    if (after) return after;
    const before = [...lines.slice(0, i), line.slice(0, first.index)];
    return before.filter((text) => text.trim()).at(-1) ?? '';
  }
  return answer;
}

/**
 * Claude's answer on one line: only what it marked to send (see marked), and without the sources
 * list web search makes it add.
 */
function oneLine(answer: string): string {
  const message = marked(answer);
  const body = message.split(/\n\s*(?:Sources|来源)\s*[:：]/)[0] ?? '';
  return body.replace(/\s+/g, ' ').trim();
}

/**
 * Something Claude wrote to say to the room unprompted, as one message: on one line, cut after
 * punctuation to fit `maxLength`. Null when Claude said nothing.
 */
export function plainMessage(answer: string, maxLength: number): string | null {
  const text = oneLine(answer);
  if (!text) return null;
  return splitText(text, maxLength, 1)[0] ?? null;
}

/** Up to `maxParts` pieces of at most `size` characters, cut after punctuation when it can. */
function splitText(text: string, size: number, maxParts: number): string[] {
  let rest = [...text];
  const parts: string[] = [];
  while (rest.length && parts.length < maxParts) {
    let cut = Math.min(size, rest.length);
    if (rest.length > size) {
      // The last break in the second half of the window, so no piece ends up tiny.
      for (let i = size - 1; i >= Math.floor(size / 2); i--) {
        if (BREAK_AFTER.has(rest[i] ?? '')) {
          cut = i + 1;
          break;
        }
      }
    }
    const part = rest.slice(0, cut).join('').trim();
    if (part) parts.push(part);
    rest = rest.slice(cut);
  }
  return parts;
}
