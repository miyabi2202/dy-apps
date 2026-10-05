import * as stylex from '@stylexjs/stylex';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { COMMIT_HASH, SHORT_COMMIT_HASH } from './build';
import { text } from './text';
import { colors, fonts, fontSize, space } from './tokens.stylex';

interface PageProps extends Omit<ComponentProps<'div'>, 'className' | 'style' | 'title'> {
  /**
   * Styles the content: the title row and children. Padding, width and centring go here;
   * the background always fills the window.
   */
  xstyle?: stylex.StyleXStyles;
  /** Heading at the top of the page, followed by the build hash. Also the browser tab's title. */
  title?: string;
  /** A line under the title. Needs `title`. */
  subtitle?: ReactNode;
  /** Shown at the end of the title row, such as a reset button. Needs `title`. */
  actions?: ReactNode;
}

/** Full-height page root: background, text colour and font for an app, and its title. */
export function Page({ xstyle, title, subtitle, actions, children, ...rest }: PageProps) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  return (
    <div {...rest} {...stylex.props(styles.page)}>
      <div {...stylex.props(xstyle)}>
        {title && (
          <header {...stylex.props(styles.header)}>
            <div>
              <h1 {...stylex.props(styles.title)}>
                {title}
                <code
                  title={COMMIT_HASH}
                  data-testid="commit-hash"
                  {...stylex.props(styles.commit)}
                >
                  {SHORT_COMMIT_HASH}
                </code>
              </h1>
              {subtitle != null && <p {...stylex.props(text.muted, styles.subtitle)}>{subtitle}</p>}
            </div>
            {actions}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: colors.bg,
    color: colors.text,
    colorScheme: 'dark',
    fontFamily: fonts.body,
    minHeight: '100vh',
  },
  header: {
    gap: space.lg,
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  title: {
    margin: 0,
    gap: space.md,
    alignItems: 'baseline',
    display: 'flex',
    fontSize: 22,
    lineHeight: 1.3,
  },
  commit: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    fontWeight: 400,
  },
  subtitle: {
    margin: 0,
    marginTop: space.xs,
  },
});
