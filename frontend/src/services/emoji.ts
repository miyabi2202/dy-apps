import { DOUYIN_EMOJI } from './douyin-emoji';

/** A run of chat text, or one Douyin emoji code with its image. */
export type ChatPart = { text: string } | { emoji: string; url: string };

/** The image for a Douyin `[名]` code, served from `public/emoji/`; undefined if unknown. */
export function douyinEmojiUrl(code: string): string | undefined {
  const file = DOUYIN_EMOJI[code];
  return file && `/emoji/${file}`;
}

/**
 * Splits chat text at Douyin's `[名]` codes. A code with an image becomes an image part;
 * anything else, unknown codes included, stays text.
 */
export function splitEmoji(
  text: string,
  urlFor: (code: string) => string | undefined = douyinEmojiUrl,
): ChatPart[] {
  const parts: ChatPart[] = [];
  for (const piece of text.split(/(\[[^[\]]+\])/)) {
    if (!piece) continue;
    const url = urlFor(piece);
    const last = parts.at(-1);
    if (url) parts.push({ emoji: piece, url });
    else if (last && 'text' in last) last.text += piece;
    else parts.push({ text: piece });
  }
  return parts;
}
