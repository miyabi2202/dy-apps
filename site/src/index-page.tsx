import { Panel, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { APPS, GUIDES, type PageEntry } from './apps';
import { SHORT_COMMIT_HASH } from './build';
import { Shell } from './shell';

export function IndexPage() {
  useEffect(() => {
    document.title = 'dy-apps';
  }, []);

  return (
    <Shell>
      <h1 {...stylex.props(styles.title)}>dy-apps</h1>
      <PageList title="应用" pages={APPS} />
      <PageList title="教程" pages={GUIDES} />
      <p {...stylex.props(text.muted, styles.footer)}>构建版本 {SHORT_COMMIT_HASH}</p>
    </Shell>
  );
}

function PageList({ title, pages }: { title: string; pages: readonly PageEntry[] }) {
  return (
    <Panel title={title} gap="xs">
      <ul {...stylex.props(styles.list)}>
        {pages.map((page) => (
          <li key={page.path}>
            <Link to={page.path} {...stylex.props(styles.item)}>
              <span {...stylex.props(styles.name)}>{page.title}</span>
              <span {...stylex.props(text.muted)}>{page.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const styles = stylex.create({
  title: {
    margin: 0,
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  item: {
    padding: space.md,
    borderRadius: radius.md,
    textDecoration: 'none',
    backgroundColor: {
      default: 'transparent',
      ':hover': colors.panelRaised,
    },
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    outlineColor: colors.accent,
  },
  name: {
    color: colors.accent,
    fontSize: fontSize.lg,
    fontWeight: 600,
  },
  footer: {
    margin: 0,
  },
});
