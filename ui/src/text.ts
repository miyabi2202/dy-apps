import * as stylex from '@stylexjs/stylex';
import { colors, fontSize } from './tokens.stylex';

/** Text styles, for spreading into `stylex.props` on any element. */
export const text = stylex.create({
  /** Secondary text: hints, descriptions, labels. */
  muted: {
    color: colors.muted,
    fontSize: fontSize.sm,
  },
  /** Small bold heading above a group of content. */
  caption: {
    margin: 0,
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
});
