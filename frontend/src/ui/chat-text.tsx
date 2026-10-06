import { splitEmoji, type ChatPart } from '@dy-apps/services';
import * as stylex from '@stylexjs/stylex';

interface ChatTextProps {
  text: string;
  /** Douyin's rich text, when it sent some; shown instead of `text`. */
  parts?: readonly ChatPart[];
  /** The message is one big emote: draw it larger. */
  sticker?: boolean;
}

/**
 * A chat message with its emotes drawn as images: `parts` when Douyin sent rich text (fan-club
 * emotes, stickers), otherwise `text`. Douyin's `[名]` codes become our images either way;
 * unknown codes stay text.
 */
export function ChatText({ text, parts, sticker = false }: ChatTextProps) {
  const pieces = parts
    ? parts.flatMap((part) => ('text' in part ? splitEmoji(part.text) : [part]))
    : splitEmoji(text);
  return pieces.map((part, i) =>
    'text' in part ? (
      part.text
    ) : (
      <img
        // Parts are positional; the same emote can appear twice.
        // eslint-disable-next-line @eslint-react/no-array-index-key
        key={i}
        src={part.url}
        alt={part.emoji}
        title={part.emoji}
        {...stylex.props(styles.emoji, sticker && styles.sticker)}
      />
    ),
  );
}

const styles = stylex.create({
  // Sized to the text, sitting on its baseline like a character.
  emoji: {
    marginInline: '0.05em',
    objectFit: 'contain',
    verticalAlign: '-0.3em',
    height: '1.3em',
    width: '1.3em',
  },
  // A sticker is the whole message, so it gets room to be seen.
  sticker: {
    verticalAlign: 'middle',
    height: '4em',
    width: '4em',
  },
});
