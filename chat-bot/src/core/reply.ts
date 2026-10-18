/** Douyin's chat length limit, in characters. */
export const DOUYIN_CHAT_LIMIT = 49;

/** Where a long reply would rather be cut: after the end of a sentence or clause. */
const BREAK_AFTER = new Set([...'。！？；，、：.!?;,: ）)】」']);

/** The first 3 characters of a nickname, to @ someone when the whole name doesn't fit. */
function shortTag(nickname: string): string {
  return `@${[...nickname].slice(0, 3).join('')}`;
}

/**
 * `@nickname text` as one message: with the whole nickname when that fits in `maxLength`,
 * otherwise with its first 3 characters (the @ is typed text, not a picked mention, so a short
 * one works as well); null when even that is too long.
 */
export function oneMessage(nickname: string, text: string, maxLength: number): string | null {
  for (const tag of [`@${nickname}`, shortTag(nickname)]) {
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
}

/** The longest the text of one part may be: what the `@asker (9/9) ` prefix leaves. */
function partSize(asker: string, { maxLength, maxParts }: ReplyLimits): number {
  return maxLength - [...`${shortTag(asker)} (${maxParts}/${maxParts}) `].length;
}

/** How long an answer can be and still go out as one message (with the short @ if need be). */
export function singleBudget(asker: string, { maxLength }: ReplyLimits): number {
  return maxLength - [...`${shortTag(asker)} `].length;
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
  const tags = [`@${asker}`, shortTag(asker)];
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

  const single = oneMessage(asker, text, limits.maxLength);
  if (single) return [single];
  const size = partSize(asker, limits);
  // When the numbering would leave no room for text, one message cut to the limit.
  if (limits.maxParts <= 1 || size < 1) {
    return [[...`${shortTag(asker)} ${text}`].slice(0, limits.maxLength).join('')];
  }
  const parts = splitText(text, size, limits.maxParts);
  return parts.map((part, i) => `${shortTag(asker)} (${i + 1}/${parts.length}) ${part}`);
}

/**
 * Where Claude is told to mark the message to send (`弹幕：…`), after whatever thinking it writes
 * first; bold (`**弹幕：**`) counts too.
 */
const MESSAGE_MARK = /(?:^|\n)[ \t]*\**弹幕\**[ \t]*[:：][ \t]*\**/g;

/**
 * Claude's answer on one line: only what follows the last `弹幕：` mark when there is one (the
 * whole answer when there isn't), and without the sources list web search makes it add.
 */
function oneLine(answer: string): string {
  const mark = [...answer.matchAll(MESSAGE_MARK)].at(-1);
  const message = mark ? answer.slice(mark.index + mark[0].length) : answer;
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
