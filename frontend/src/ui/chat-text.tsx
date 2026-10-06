import { splitEmoji } from '@dy-apps/services';
import * as stylex from '@stylexjs/stylex';

/** A chat message with Douyin's `[名]` codes drawn as their images; unknown codes stay text. */
export function ChatText({ text }: { text: string }) {
  return splitEmoji(text).map((part, i) =>
    'text' in part ? (
      part.text
    ) : (
      <img
        // Parts are positional; the same code can appear twice.
        // eslint-disable-next-line @eslint-react/no-array-index-key
        key={i}
        src={part.url}
        alt={part.emoji}
        title={part.emoji}
        {...stylex.props(styles.emoji)}
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
});
