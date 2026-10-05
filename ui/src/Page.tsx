import * as stylex from '@stylexjs/stylex';
import type { ComponentProps } from 'react';
import { colors, fonts } from './tokens.stylex';

interface PageProps extends Omit<ComponentProps<'div'>, 'className' | 'style'> {
  xstyle?: stylex.StyleXStyles;
}

/** Full-height page root: background, text colour and font for an app. */
export function Page({ xstyle, ...rest }: PageProps) {
  return <div {...rest} {...stylex.props(styles.page, xstyle)} />;
}

const styles = stylex.create({
  page: {
    backgroundColor: colors.bg,
    color: colors.text,
    colorScheme: 'dark',
    fontFamily: fonts.body,
    minHeight: '100vh',
  },
});
