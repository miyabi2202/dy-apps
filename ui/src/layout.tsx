import * as stylex from '@stylexjs/stylex';
import type { ComponentProps } from 'react';
import { space } from './tokens.stylex';

/** A step on the spacing scale (see `space` in tokens.stylex). */
export type Space = 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
type Justify = 'start' | 'center' | 'end' | 'between';

interface FlexProps extends Omit<ComponentProps<'div'>, 'className' | 'style'> {
  gap?: Space;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
  xstyle?: stylex.StyleXStyles;
}

/** Children side by side, spaced by `gap`. */
export function Row({ gap = 'md', align = 'center', justify, wrap, xstyle, ...rest }: FlexProps) {
  return (
    <div
      {...rest}
      {...stylex.props(
        styles.row,
        gaps[gap],
        aligns[align],
        justify && justifies[justify],
        wrap && styles.wrap,
        xstyle,
      )}
    />
  );
}

/** Children stacked vertically, spaced by `gap`. */
export function Column({
  gap = 'md',
  align = 'stretch',
  justify,
  wrap,
  xstyle,
  ...rest
}: FlexProps) {
  return (
    <div
      {...rest}
      {...stylex.props(
        styles.column,
        gaps[gap],
        aligns[align],
        justify && justifies[justify],
        wrap && styles.wrap,
        xstyle,
      )}
    />
  );
}

interface GridProps extends Omit<ComponentProps<'div'>, 'className' | 'style'> {
  gap?: Space;
  /** Fixed number of equal columns. */
  columns?: number;
  /** Otherwise: as many columns as fit, each at least this wide (px). */
  min?: number;
  xstyle?: stylex.StyleXStyles;
}

/** Equal-width columns: a fixed count, or as many as fit at `min` px each. */
export function Grid({ gap = 'md', columns, min = 160, xstyle, ...rest }: GridProps) {
  return (
    <div
      {...rest}
      {...stylex.props(
        styles.grid,
        gaps[gap],
        columns ? styles.columns(columns) : styles.fit(min),
        xstyle,
      )}
    />
  );
}

const styles = stylex.create({
  row: { display: 'flex', minWidth: 0 },
  column: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  wrap: { flexWrap: 'wrap' },
  grid: { display: 'grid' },
  columns: (n: number) => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }),
  fit: (min: number) => ({ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }),
});

/** `gap` for each spacing step; Panel reuses it. */
export const gaps = stylex.create({
  xxs: { gap: space.xxs },
  xs: { gap: space.xs },
  sm: { gap: space.sm },
  md: { gap: space.md },
  lg: { gap: space.lg },
  xl: { gap: space.xl },
  xxl: { gap: space.xxl },
});

const aligns = stylex.create({
  start: { alignItems: 'flex-start' },
  center: { alignItems: 'center' },
  end: { alignItems: 'flex-end' },
  stretch: { alignItems: 'stretch' },
  baseline: { alignItems: 'baseline' },
});

const justifies = stylex.create({
  start: { justifyContent: 'flex-start' },
  center: { justifyContent: 'center' },
  end: { justifyContent: 'flex-end' },
  between: { justifyContent: 'space-between' },
});
