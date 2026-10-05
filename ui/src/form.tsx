import * as stylex from '@stylexjs/stylex';
import { createContext, use, useId, type ComponentProps, type ReactNode } from 'react';
import { text } from './text';
import { colors, fontSize, radius, space } from './tokens.stylex';

const FieldIdContext = createContext<string | undefined>(undefined);

/**
 * The id a Field gives its control. Input and Select use it automatically; a custom
 * control inside a Field puts it on its own element so the label points at it.
 */
export function useFieldId(): string | undefined {
  return use(FieldIdContext);
}

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

/**
 * A label above its control, linked by id (not by nesting, so the label's accessible
 * text stays just the label, without a select's options or a slider's value).
 */
export function Field({ label, children, xstyle }: FieldProps) {
  const id = useId();
  return (
    <div {...stylex.props(styles.field, xstyle)}>
      <label htmlFor={id} {...stylex.props(text.muted)}>
        {label}
      </label>
      <FieldIdContext value={id}>{children}</FieldIdContext>
    </div>
  );
}

interface InputProps extends Omit<ComponentProps<'input'>, 'className' | 'style'> {
  xstyle?: stylex.StyleXStyles;
}

export function Input({ id, xstyle, ...rest }: InputProps) {
  const fieldId = useFieldId();
  return <input id={id ?? fieldId} {...rest} {...stylex.props(styles.control, xstyle)} />;
}

interface SelectProps extends Omit<ComponentProps<'select'>, 'className' | 'style'> {
  xstyle?: stylex.StyleXStyles;
}

export function Select({ id, xstyle, ...rest }: SelectProps) {
  const fieldId = useFieldId();
  return (
    <select id={id ?? fieldId} {...rest} {...stylex.props(styles.control, styles.select, xstyle)} />
  );
}

const styles = stylex.create({
  field: {
    gap: space.xs,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  control: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingInline: space.md,
    backgroundColor: {
      default: colors.bg,
      ':disabled': colors.panel,
    },
    color: {
      default: colors.text,
      ':disabled': colors.muted,
    },
    fontFamily: 'inherit',
    fontSize: fontSize.md,
    outlineColor: colors.accent,
    minHeight: 36,
    minWidth: 0,
    width: '100%',
  },
  // The native arrow ignores padding and hugs the border, so draw our own: a small
  // triangle from two gradients, inset like the text and coloured with a token.
  select: {
    backgroundPosition: 'calc(100% - 18px) 55%, calc(100% - 13px) 55%',
    appearance: 'none',
    backgroundImage: `linear-gradient(45deg, transparent 50%, ${colors.muted} 50%), linear-gradient(135deg, ${colors.muted} 50%, transparent 50%)`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: '5px 5px',
    paddingInlineEnd: space.xxl,
  },
});
