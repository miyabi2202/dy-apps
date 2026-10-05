import { Button, Column, Field, Grid, Input, Panel, Row, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import type { LocalGiftAdapter } from '../adapters/local-gift';
import { CONFIG, EFFECT_INFO, EFFECT_POOL, GIFT_NAME } from '../core/config';
import type { GameEngine, GiftHistoryEntry } from '../core/game';
import { effectName, percent } from './format';

interface Props {
  engine: GameEngine;
  gifts: LocalGiftAdapter;
}

export function TeamPanel({ engine, gifts }: Props) {
  const pending = EFFECT_POOL.filter((type) => engine.team.pending[type] > 0);

  return (
    <Panel aria-label="诅咒" data-testid="panel-team" xstyle={styles.panel}>
      <h3 {...stylex.props(text.caption)}>待执行诅咒</h3>
      {pending.length ? (
        <ul {...stylex.props(styles.pending)} data-testid="pending">
          {pending.map((type) => (
            <li key={type} {...stylex.props(styles.pendingItem)}>
              <span>{effectName(type)}</span>
              <span {...stylex.props(styles.pendingCount)}>×{engine.team.pending[type]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p {...stylex.props(text.muted, styles.flush)} data-testid="pending">
          暂无
        </p>
      )}

      <h3 {...stylex.props(text.caption)}>送礼记录</h3>
      <ol {...stylex.props(styles.history)} data-testid="gift-history" aria-label="送礼记录">
        {engine.giftHistory.length === 0 && <li {...stylex.props(text.muted)}>尚未送礼。</li>}
        {engine.giftHistory.map((entry) => (
          <HistoryEntry key={entry.id} entry={entry} />
        ))}
      </ol>

      <GiftControls engine={engine} gifts={gifts} />
    </Panel>
  );
}

function HistoryEntry({ entry }: { entry: GiftHistoryEntry }) {
  const drawn = EFFECT_POOL.filter((type) => (entry.effects[type] ?? 0) > 0);
  return (
    <li {...stylex.props(styles.historyEntry)}>
      <span>
        <span {...stylex.props(styles.sender)}>{entry.sender}</span> 送出 {entry.count} 份
        {GIFT_NAME}
      </span>
      {drawn.length ? (
        <ul {...stylex.props(styles.drawn)}>
          {drawn.map((type) => (
            <li key={type}>
              {effectName(type)} ×{entry.effects[type]}
            </li>
          ))}
        </ul>
      ) : (
        <span {...stylex.props(text.muted)}>未触发诅咒</span>
      )}
    </li>
  );
}

/** Local test controls; removed once real gifts are wired up. */
function GiftControls({ engine, gifts }: Props) {
  const disabled = engine.phase === 'gameOver';
  const [custom, setCustom] = useState('1000');
  const [error, setError] = useState<string | null>(null);

  const send = (count: number) => {
    const res = gifts.send(count);
    setError(res.ok ? null : res.error);
  };

  return (
    <Column gap="md" xstyle={styles.giftCard}>
      <Row gap="md">
        <span aria-hidden {...stylex.props(styles.star)}>
          ✦
        </span>
        <div>
          <div {...stylex.props(styles.giftName)}>{GIFT_NAME}</div>
          <div {...stylex.props(text.muted)}>
            触发概率 {percent(engine.probability)}，命中后从诅咒池四选一（各{' '}
            {percent(1 / EFFECT_POOL.length)}）
          </div>
        </div>
      </Row>
      <Grid columns={3} gap="sm">
        {CONFIG.gifts.quickBatches.map((n) => (
          <Button
            key={n}
            disabled={disabled}
            aria-label={`送 ${n} 份${GIFT_NAME}`}
            onClick={() => send(n)}
            xstyle={styles.giftButton}
          >
            送 {n} 份
          </Button>
        ))}
      </Grid>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send(Number(custom));
        }}
      >
        <Row gap="sm" align="end">
          <Field label="自定义份数" xstyle={styles.grow}>
            <Input
              type="number"
              min={CONFIG.gifts.minBatch}
              max={CONFIG.gifts.maxBatch}
              step={1}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-label="自定义份数"
            />
          </Field>
          <Button type="submit" disabled={disabled} aria-label="送出自定义份数">
            送出
          </Button>
        </Row>
      </form>
      {error && (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      )}
      <details {...stylex.props(styles.details)}>
        <summary {...stylex.props(styles.summary)}>效果池</summary>
        <ul {...stylex.props(styles.poolList)}>
          {EFFECT_POOL.map((type) => (
            <li key={type}>
              <strong>{EFFECT_INFO[type].name}</strong>：{EFFECT_INFO[type].description}
            </li>
          ))}
        </ul>
      </details>
    </Column>
  );
}

const styles = stylex.create({
  panel: {
    borderTopColor: colors.danger,
    borderTopWidth: 4,
  },
  flush: {
    margin: 0,
  },
  giftCard: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.panelRaised,
  },
  star: {
    color: colors.warn,
    fontSize: 28,
  },
  giftName: {
    fontSize: fontSize.lg,
    fontWeight: 700,
  },
  // Curse-tinted quick-send buttons.
  giftButton: {
    borderColor: colors.danger,
    backgroundColor: {
      default: colors.dangerSoft,
      ':disabled': colors.panel,
      ':hover': 'rgba(248, 113, 113, 0.25)',
    },
  },
  grow: {
    flexGrow: 1,
  },
  error: {
    margin: 0,
    color: colors.danger,
    fontSize: fontSize.sm,
  },
  details: {
    fontSize: fontSize.sm,
  },
  summary: {
    color: colors.accent,
    cursor: 'pointer',
  },
  poolList: {
    marginBlock: space.sm,
    lineHeight: 1.6,
    paddingInlineStart: space.xl,
  },
  pending: {
    margin: 0,
    padding: 0,
    gap: space.xs,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  pendingItem: {
    borderRadius: radius.sm,
    paddingBlock: space.sm,
    paddingInline: space.md,
    backgroundColor: colors.panelRaised,
    display: 'flex',
    fontSize: 15,
    justifyContent: 'space-between',
  },
  pendingCount: {
    color: colors.danger,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
  history: {
    margin: 0,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 1,
    gap: space.md,
    listStyle: 'none',
    paddingBlock: space.md,
    paddingInline: space.md,
    backgroundColor: colors.panelRaised,
    display: 'flex',
    flexDirection: 'column',
    fontSize: fontSize.sm,
    height: 320,
    overflowY: 'auto',
  },
  historyEntry: {
    gap: space.xxs,
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.5,
  },
  sender: {
    fontWeight: 700,
  },
  drawn: {
    margin: 0,
    paddingInlineStart: space.xl,
  },
});
