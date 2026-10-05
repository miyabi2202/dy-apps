import { Column, Page } from '@dy-apps/ui';
import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';

/** The index and 404 pages: an app Page with a narrow centred column. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <Page>
      <Column gap="xxl" xstyle={styles.column}>
        {children}
      </Column>
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
