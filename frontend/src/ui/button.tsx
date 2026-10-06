import * as stylex from '@stylexjs/stylex';
import type { ComponentProps } from 'react';
import { colors, fontSize, radius, space } from './tokens.stylex';

export type ButtonVariant = 'default' | 'primary' | 'danger';

interface ButtonProps extends Omit<ComponentProps<'button'>, 'className' | 'style'> {
  variant?: ButtonVariant;
  xstyle?: stylex.StyleXStyles;
}

/** The one button. `type` defaults to "button" so it never submits a form by accident. */
export function Button({ variant = 'default', type = 'button', xstyle, ...rest }: ButtonProps) {
  return <button type={type} {...rest} {...stylex.props(styles.base, variants[variant], xstyle)} />;
}

interface ButtonLinkProps extends Omit<ComponentProps<'a'>, 'className' | 'style'> {
  variant?: ButtonVariant;
  xstyle?: stylex.StyleXStyles;
}

/** A link that looks like a Button, for actions that navigate or open a page. */
export function ButtonLink({ variant = 'default', xstyle, ...rest }: ButtonLinkProps) {
  return <a {...rest} {...stylex.props(styles.base, styles.link, variants[variant], xstyle)} />;
}

const styles = stylex.create({
  link: {
    textDecoration: 'none',
    alignItems: 'center',
    display: 'inline-flex',
    justifyContent: 'center',
  },
  base: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    backgroundColor: {
      default: colors.panelRaised,
      ':disabled': colors.panel,
      ':hover': colors.border,
    },
    color: {
      default: colors.text,
      ':disabled': colors.muted,
    },
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed',
    },
    fontFamily: 'inherit',
    fontSize: fontSize.md,
    outlineColor: colors.accent,
    outlineOffset: 2,
    minHeight: 36,
  },
});

const variants = stylex.create({
  default: {},
  primary: {
    borderColor: {
      default: colors.accent,
      ':disabled': colors.border,
    },
    backgroundColor: {
      default: colors.accent,
      ':disabled': colors.panel,
      ':hover': colors.accentHover,
    },
    color: {
      default: colors.onAccent,
      ':disabled': colors.muted,
    },
    fontWeight: 700,
  },
  danger: {
    borderColor: {
      default: colors.danger,
      ':disabled': colors.border,
    },
    backgroundColor: {
      default: colors.danger,
      ':disabled': colors.panel,
      ':hover': colors.dangerHover,
    },
    color: {
      default: colors.onAccent,
      ':disabled': colors.muted,
    },
    fontWeight: 700,
  },
});
