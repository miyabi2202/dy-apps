import * as stylex from '@stylexjs/stylex';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { gaps, type Space } from './layout';
import { text } from './text';
import { colors, radius, space } from './tokens.stylex';

interface PanelProps extends Omit<ComponentProps<'section'>, 'className' | 'style' | 'title'> {
  /** Small heading at the top; also labels the section unless `aria-label` is given. */
  title?: ReactNode;
  gap?: Space;
  xstyle?: stylex.StyleXStyles;
}

/** A bordered surface grouping related content, laid out as a column. */
export function Panel({ title, gap = 'lg', xstyle, children, ...rest }: PanelProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={title != null && !rest['aria-label'] ? titleId : undefined}
      {...rest}
      {...stylex.props(styles.panel, gaps[gap], xstyle)}
    >
      {title != null && (
        <h2 id={titleId} {...stylex.props(text.caption)}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

const styles = stylex.create({
  panel: {
    padding: space.lg,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderStyle: 'solid',
    borderWidth: 1,
    backgroundColor: colors.panel,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
});
