import * as stylex from '@stylexjs/stylex';
import type { ComponentProps, ReactNode } from 'react';
import { colors, fontSize, space } from './tokens.stylex';

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'className' | 'style' | 'type'> {
  label: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

/** A checkbox with its label beside it. */
export function Checkbox({ label, xstyle, ...rest }: CheckboxProps) {
  return (
    <label {...stylex.props(styles.label, xstyle)}>
      <input type="checkbox" {...rest} {...stylex.props(styles.box)} />
      {label}
    </label>
  );
}

const styles = stylex.create({
  label: {
    gap: space.sm,
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSize.sm,
  },
  box: {
    margin: 0,
    accentColor: colors.accent,
  },
});
