import { Button, Field, Input, Panel, Row, text } from '@dy-apps/ui';
import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useState, type FormEvent } from 'react';
import { labels, testIds } from '../messages';
import { parseSide, SIZE_RANGE, type WorldSize } from '../settings';

interface Props {
  /** The world's current size, and what to do with a new one. */
  size: WorldSize;
  onResize: (size: WorldSize) => void;
}

/** Width and height inputs; 应用尺寸 sends them off once both are whole numbers in range. */
export function SizePanel({ size, onResize }: Props) {
  const [width, setWidth] = useState(String(size.width));
  const [height, setHeight] = useState(String(size.height));
  const w = parseSide(width);
  const h = parseSide(height);
  const changed = w !== size.width || h !== size.height;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (w !== null && h !== null) onResize({ width: w, height: h });
  };

  return (
    <Panel title={labels.size.title} gap="md">
      <form onSubmit={submit}>
        <Row gap="md" align="end" wrap>
          <Field label={labels.size.width} xstyle={styles.side}>
            <Input
              type="number"
              inputMode="numeric"
              min={SIZE_RANGE.min}
              max={SIZE_RANGE.max}
              step={1}
              value={width}
              onChange={(event) => setWidth(event.target.value)}
              data-testid={testIds.width}
            />
          </Field>
          <Field label={labels.size.height} xstyle={styles.side}>
            <Input
              type="number"
              inputMode="numeric"
              min={SIZE_RANGE.min}
              max={SIZE_RANGE.max}
              step={1}
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              data-testid={testIds.height}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={w === null || h === null || !changed}>
            {labels.size.apply}
          </Button>
        </Row>
        <p {...stylex.props(text.muted, styles.hint)}>{labels.size.hint}</p>
      </form>
    </Panel>
  );
}

const styles = stylex.create({
  side: {
    flexBasis: 100,
    flexGrow: 1,
  },
  hint: {
    margin: 0,
    lineHeight: 1.5,
    marginTop: space.sm,
  },
});
