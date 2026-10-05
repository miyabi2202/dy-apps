import { Column, Page } from '@dy-apps/ui';
import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';

/** The index and 404 pages: an app Page with its title, in a narrow centred column. */
export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page title={title} xstyle={styles.column}>
      <Column gap="xxl">{children}</Column>
    </Page>
  );
}

const styles = stylex.create({
  column: {
    marginInline: 'auto',
    paddingBlock: 40,
    paddingInline: space.xl,
    lineHeight: 1.6,
    maxWidth: 720,
  },
});
