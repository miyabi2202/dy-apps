import * as stylex from '@stylexjs/stylex';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { COMMIT_HASH, SHORT_COMMIT_HASH } from './build';
import { text } from './text';
import { colors, fonts, fontSize, radius, space } from './tokens.stylex';

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
  /** The home icon before the title links here; false hides it, as on the home page itself. */
  home?: string | false;
}

/** Full-height page root: background, text colour and font for an app, and its title. */
export function Page({
  xstyle,
  title,
  subtitle,
  actions,
  home = '/',
  children,
  ...rest
}: PageProps) {
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
                {home !== false && (
                  <a
                    href={home}
                    aria-label="返回首页"
                    title="返回首页"
                    {...stylex.props(styles.home)}
                  >
                    <HomeIcon />
                  </a>
                )}
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

function HomeIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
    </svg>
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
  // Sits on the title's baseline row, a little smaller than the text, and lights up on hover.
  home: {
    borderRadius: radius.sm,
    alignSelf: 'center',
    color: {
      default: colors.muted,
      ':hover': colors.accent,
    },
    display: 'inline-flex',
    fontSize: '0.9em',
    outlineColor: colors.accent,
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
