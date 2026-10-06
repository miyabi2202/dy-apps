import { Button, Field, Input, Panel, Row, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useState, type FormEvent } from 'react';
import { labels, testIds } from '../messages';
import { parseSide, SIZE_RANGE, type WorldSize } from '../settings';

export interface PileStats {
  /** Icons in the world, falling or at rest. */
  total: number;
  falling: number;
  /** Asked for but not yet released. */
  queued: number;
}

interface Props {
  stats: PileStats;
  /** The most icons the pile holds; the input is capped at what's left. */
  maxItems: number;
  onAdd: (count: number) => void;
  onClear: () => void;
  /** The world's current size, and what to do with a new one. */
  size: WorldSize;
  onResize: (size: WorldSize) => void;
}

/** A positive whole number, or null. */
function parseCount(value: string): number | null {
  return /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

/** The number to add, the 添加 and 清空 buttons, the canvas size, and how many icons there are. */
export function ControlPanel({ stats, maxItems, onAdd, onClear, size, onResize }: Props) {
  const [value, setValue] = useState('100');
  const room = maxItems - stats.total - stats.queued;
  const count = parseCount(value);
  const canAdd = count !== null && room > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (count !== null && room > 0) onAdd(Math.min(count, room));
  };

  return (
    <Panel title={labels.panel} gap="md">
      <form onSubmit={submit}>
        <Row gap="md" align="end" wrap>
          <Field label={labels.count} xstyle={styles.count}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, room)}
              step={1}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              data-testid={testIds.count}
            />
          </Field>
          <Row gap="sm">
            <Button type="submit" variant="primary" disabled={!canAdd}>
              {labels.add}
            </Button>
            <Button onClick={onClear} disabled={stats.total === 0 && stats.queued === 0}>
              {labels.clear}
            </Button>
          </Row>
        </Row>
        <p {...stylex.props(text.muted, styles.hint)}>
          最多 {maxItems.toLocaleString('zh-CN')} 个，还能加 {room.toLocaleString('zh-CN')} 个。
          画面装满后，继续添加的会堆到画面上方。
        </p>
      </form>
      <SizeForm size={size} onResize={onResize} />
      <dl data-testid={testIds.stats} {...stylex.props(styles.stats)}>
        <Stat label={labels.stats.total} value={stats.total} />
        <Stat label={labels.stats.falling} value={stats.falling} />
        <Stat label={labels.stats.queued} value={stats.queued} />
      </dl>
    </Panel>
  );
}

/** Width and height inputs; 应用尺寸 sends them off once both are whole numbers in range. */
function SizeForm({ size, onResize }: { size: WorldSize; onResize: (size: WorldSize) => void }) {
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
    <form onSubmit={submit} aria-label={labels.size.title}>
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
        <Button type="submit" disabled={w === null || h === null || !changed}>
          {labels.size.apply}
        </Button>
      </Row>
      <p {...stylex.props(text.muted, styles.hint)}>{labels.size.hint}</p>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div {...stylex.props(styles.stat)}>
      <dt {...stylex.props(text.muted, styles.statLabel)}>{label}</dt>
      <dd {...stylex.props(styles.statValue)}>{value.toLocaleString('zh-CN')}</dd>
    </div>
  );
}

const styles = stylex.create({
  count: {
    flexBasis: 200,
    flexGrow: 1,
  },
  side: {
    flexBasis: 120,
    flexGrow: 1,
    maxWidth: 200,
  },
  hint: {
    margin: 0,
    lineHeight: 1.5,
    marginTop: space.sm,
  },
  stats: {
    margin: 0,
    gap: space.sm,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  },
  stat: {
    borderRadius: radius.sm,
    paddingBlock: space.xs,
    paddingInline: space.md,
    backgroundColor: colors.panelRaised,
  },
  statLabel: {
    fontSize: fontSize.xs,
  },
  statValue: {
    margin: 0,
    fontSize: fontSize.lg,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
});
