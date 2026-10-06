import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { CopyButton } from './copy-button';
import { Input } from './form';
import { Row } from './layout';
import { text } from './text';

/** A read-only OBS browser-source link with a copy button, and how to use it underneath. */
export function ObsLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <>
      <Row gap="md">
        <Input readOnly aria-label="OBS 链接" value={url} onFocus={(e) => e.target.select()} />
        <CopyButton value={url} xstyle={styles.noShrink} />
      </Row>
      <p {...stylex.props(text.muted, styles.hint)}>{children}</p>
    </>
  );
}

const styles = stylex.create({
  noShrink: {
    flexShrink: 0,
  },
  hint: {
    margin: 0,
    lineHeight: 1.5,
  },
});
