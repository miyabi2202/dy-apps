import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import type { LocalGiftAdapter } from '../adapters/local-gift';
import { CONFIG, EFFECT_INFO, EFFECT_POOL, GIFT_NAME } from '../core/config';
import type { GameEngine, GiftHistoryEntry } from '../core/game';
import { effectName, percent } from './format';
import { ui } from './styles';
import { colors } from './tokens.stylex';

interface Props {
  engine: GameEngine;
  gifts: LocalGiftAdapter;
}

export function TeamPanel({ engine, gifts }: Props) {
  const pending = EFFECT_POOL.filter((type) => engine.team.pending[type] > 0);

  return (
    <section aria-label="诅咒" data-testid="panel-team" {...stylex.props(ui.panel, styles.panel)}>
      <h3 {...stylex.props(ui.subTitle, styles.sectionTitle)}>待执行诅咒</h3>
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
        <p {...stylex.props(ui.muted, styles.sectionTitle)} data-testid="pending">
          暂无
        </p>
      )}

      <h3 {...stylex.props(ui.subTitle, styles.sectionTitle)}>送礼记录</h3>
      <ol {...stylex.props(styles.history)} data-testid="gift-history" aria-label="送礼记录">
        {engine.giftHistory.length === 0 && <li {...stylex.props(ui.muted)}>尚未送礼。</li>}
        {engine.giftHistory.map((entry) => (
          <HistoryEntry key={entry.id} entry={entry} />
        ))}
      </ol>

      <GiftControls engine={engine} gifts={gifts} />
    </section>
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
        <span {...stylex.props(ui.muted)}>未触发诅咒</span>
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
    <div {...stylex.props(styles.giftCard)}>
      <div {...stylex.props(styles.giftHeader)}>
        <span aria-hidden {...stylex.props(styles.star)}>
          ✦
        </span>
        <div>
          <div {...stylex.props(styles.giftName)}>{GIFT_NAME}</div>
          <div {...stylex.props(ui.muted)}>
            触发概率 {percent(engine.probability)}，命中后从诅咒池四选一（各{' '}
            {percent(1 / EFFECT_POOL.length)}）
          </div>
        </div>
      </div>
      <div {...stylex.props(styles.buttons)}>
        {CONFIG.gifts.quickBatches.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-label={`送 ${n} 份${GIFT_NAME}`}
            onClick={() => send(n)}
            {...stylex.props(ui.button, styles.giftButton)}
          >
            送 {n} 份
          </button>
        ))}
      </div>
      <form
        noValidate
        {...stylex.props(styles.customRow)}
        onSubmit={(e) => {
          e.preventDefault();
          send(Number(custom));
        }}
      >
        <label {...stylex.props(ui.muted, styles.customLabel)}>
          自定义份数
          <input
            type="number"
            min={CONFIG.gifts.minBatch}
            max={CONFIG.gifts.maxBatch}
            step={1}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="自定义份数"
            {...stylex.props(ui.input)}
          />
        </label>
        <button
          type="submit"
          disabled={disabled}
          aria-label="送出自定义份数"
          {...stylex.props(ui.button)}
        >
          送出
        </button>
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
    </div>
  );
}

const styles = stylex.create({
  panel: {
    borderTopColor: colors.curse,
    borderTopWidth: 4,
  },
  giftCard: {
    padding: 12,
    borderRadius: 10,
    gap: 10,
    backgroundColor: colors.panelRaised,
    display: 'flex',
    flexDirection: 'column',
  },
  giftHeader: {
    gap: 10,
    alignItems: 'center',
    display: 'flex',
  },
  star: {
    color: colors.warn,
    fontSize: 28,
  },
  giftName: {
    fontSize: 16,
    fontWeight: 700,
  },
  buttons: {
    gap: 6,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
  },
  giftButton: {
    borderColor: colors.curse,
    backgroundColor: {
      default: colors.curseSoft,
      ':hover': 'rgba(248, 113, 113, 0.25)',
    },
  },
  customRow: {
    gap: 6,
    alignItems: 'flex-end',
    display: 'flex',
  },
  customLabel: {
    gap: 4,
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  },
  error: {
    margin: 0,
    color: colors.curse,
    fontSize: 13,
  },
  details: {
    fontSize: 13,
  },
  summary: {
    color: colors.accent,
    cursor: 'pointer',
  },
  poolList: {
    marginBlock: 6,
    lineHeight: 1.6,
    paddingInlineStart: 18,
  },
  sectionTitle: {
    margin: 0,
  },
  pending: {
    margin: 0,
    padding: 0,
    gap: 4,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  pendingItem: {
    borderRadius: 6,
    paddingBlock: 6,
    paddingInline: 10,
    backgroundColor: colors.panelRaised,
    display: 'flex',
    fontSize: 15,
    justifyContent: 'space-between',
  },
  pendingCount: {
    color: colors.curse,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
  history: {
    margin: 0,
    borderColor: colors.border,
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    gap: 8,
    listStyle: 'none',
    paddingBlock: 8,
    paddingInline: 10,
    backgroundColor: colors.panelRaised,
    display: 'flex',
    flexDirection: 'column',
    fontSize: 13,
    height: 320,
    overflowY: 'auto',
  },
  historyEntry: {
    gap: 2,
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.5,
  },
  sender: {
    fontWeight: 700,
  },
  drawn: {
    margin: 0,
    paddingInlineStart: 16,
  },
});
