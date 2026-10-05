import { Panel, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Link } from 'react-router';
import { APPS, GUIDES, type PageEntry } from './apps';
import { Shell } from './shell';

export function IndexPage() {
  return (
    <Shell title="dy-apps">
      <PageList title="应用" pages={APPS} />
      <PageList title="教程" pages={GUIDES} />
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
});
