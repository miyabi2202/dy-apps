import * as stylex from '@stylexjs/stylex';
import type { ComponentProps, ReactNode } from 'react';
import { colors, fontSize } from './tokens.stylex';

interface DisclosureProps extends Omit<ComponentProps<'details'>, 'className' | 'style'> {
  /** What is always shown, to click to open or close the rest. */
  summary: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

/** A section that stays closed until its summary is clicked, for detail the page can do without. */
export function Disclosure({ summary, xstyle, children, ...rest }: DisclosureProps) {
  return (
    <details {...rest} {...stylex.props(styles.details, xstyle)}>
      <summary {...stylex.props(styles.summary)}>{summary}</summary>
      {children}
    </details>
  );
}

const styles = stylex.create({
  details: {
    fontSize: fontSize.sm,
  },
  summary: {
    color: colors.accent,
    cursor: 'pointer',
  },
});
