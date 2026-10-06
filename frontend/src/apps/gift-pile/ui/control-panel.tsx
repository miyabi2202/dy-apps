import { Button, Field, Input, Panel, Row, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useState, type FormEvent } from 'react';
import { labels, testIds } from '../messages';

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
  /** Destroy this many icons, picked at random. */
  onRemove: (count: number) => void;
  onClear: () => void;
}

/** A positive whole number, or null. */
function parseCount(value: string): number | null {
  return /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

/** The number to add or remove, the 添加, 减少 and 清空 buttons, and how many icons there are. */
export function ControlPanel({ stats, maxItems, onAdd, onRemove, onClear }: Props) {
  const [value, setValue] = useState('100');
  const room = maxItems - stats.total - stats.queued;
  const count = parseCount(value);
  const canAdd = count !== null && room > 0;
  const canRemove = count !== null && stats.total > 0;

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
            <Button
              onClick={() => count !== null && onRemove(Math.min(count, stats.total))}
              disabled={!canRemove}
            >
              {labels.remove}
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
      <dl data-testid={testIds.stats} {...stylex.props(styles.stats)}>
        <Stat label={labels.stats.total} value={stats.total} />
        <Stat label={labels.stats.falling} value={stats.falling} />
        <Stat label={labels.stats.queued} value={stats.queued} />
      </dl>
    </Panel>
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
    flexBasis: 160,
    flexGrow: 1,
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
