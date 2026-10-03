import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import type { LocalGiftAdapter } from '../adapters/local-gift';
import { CONFIG, EFFECT_INFO, EFFECT_POOLS, GIFT_NAME, SIDE_INFO } from '../core/config';
import type { GameEngine } from '../core/game';
import { levelOf, netGarbage, reserveTotal } from '../core/interventions';
import type { EffectNode, GiftBatchResult, Side } from '../core/types';
import { effectName, percent } from './format';
import { ui } from './styles';
import { colors } from './tokens.stylex';

interface Props {
  engine: GameEngine;
  gifts: LocalGiftAdapter;
  side: Side;
}

export function TeamPanel({ engine, gifts, side }: Props) {
  const team = engine.teams[side];
  const info = SIDE_INFO[side];
  const disabled = engine.phase === 'gameOver';
  const [custom, setCustom] = useState('1000');
  const [error, setError] = useState<string | null>(null);

  const send = (count: number) => {
    const res = gifts.send(side, count);
    setError(res.ok ? null : res.error);
  };

  const accent = side === 'bless' ? styles.blessAccent : styles.curseAccent;
  const pool = EFFECT_POOLS[side];

  return (
    <section
      aria-label={info.name}
      data-testid={`panel-${side}`}
      {...stylex.props(ui.panel, styles.panel, accent)}
    >
      <h2 {...stylex.props(styles.title, side === 'bless' ? styles.blessText : styles.curseText)}>
        {side === 'bless' ? '✚ ' : '✖ '}
        {info.name}
      </h2>

      <div {...stylex.props(styles.giftCard)}>
        <div {...stylex.props(styles.giftHeader)}>
          <span aria-hidden {...stylex.props(styles.star)}>
            ✦
          </span>
          <div>
            <div {...stylex.props(styles.giftName)}>{GIFT_NAME}</div>
            <div {...stylex.props(ui.muted)}>
              触发概率 {percent(engine.probability)}，命中后从{info.short}效果池四选一（各{' '}
              {percent(1 / pool.length)}）
            </div>
          </div>
        </div>
        <div {...stylex.props(styles.buttons)}>
          {CONFIG.gifts.quickBatches.map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-label={`${info.name}送 ${n} 份${GIFT_NAME}`}
              onClick={() => send(n)}
              {...stylex.props(
                ui.button,
                side === 'bless' ? styles.blessButton : styles.curseButton,
              )}
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
              aria-label={`${info.name}自定义份数`}
              {...stylex.props(ui.input)}
            />
          </label>
          <button
            type="submit"
            disabled={disabled}
            aria-label={`${info.name}送出自定义份数`}
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
            {pool.map((type) => (
              <li key={type}>
                <strong>{EFFECT_INFO[type].name}</strong>：{EFFECT_INFO[type].levels.join(' / ')}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <BatchSummary result={engine.lastBatch[side]} />

      <h3 {...stylex.props(ui.subTitle)}>待执行队列</h3>
      <ol {...stylex.props(styles.queue)} aria-label={`${info.name}待执行队列`}>
        {Array.from({ length: CONFIG.queue.capacity }, (_, i) => (
          <QueueSlot
            key={i}
            index={i}
            node={team.queue[i] ?? null}
            locksUntil={engine.locksUntilSlot(i)}
          />
        ))}
      </ol>

      <h3 {...stylex.props(ui.subTitle)}>
        储备 {reserveTotal(team)} / {CONFIG.queue.reserveCapacity}
      </h3>
      <ul {...stylex.props(styles.reserve)} data-testid={`reserve-${side}`}>
        {pool.map((type) => (
          <li key={type} {...stylex.props(styles.reserveItem)}>
            <span>{effectName(type)}</span>
            <strong>{team.reserve[type]?.energy ?? 0}</strong>
          </li>
        ))}
      </ul>

      <h3 {...stylex.props(ui.subTitle)}>累计</h3>
      <dl {...stylex.props(ui.statGrid)} data-testid={`totals-${side}`}>
        <Stat label="礼物份数" value={team.giftCount} />
        <Stat label="命中" value={team.hitCount} />
        <Stat label="未触发" value={team.missCount} />
        <Stat label="累计触发能量" value={team.hitCount} />
        <Stat label="满额仅记账" value={team.overflowEnergy} />
        <Stat label="已执行能量" value={team.spentEnergy} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div {...stylex.props(ui.stat)}>
      <dt {...stylex.props(ui.statLabel)}>{label}</dt>
      <dd {...stylex.props(ui.statValue)}>{value}</dd>
    </div>
  );
}

function BatchSummary({ result }: { result: GiftBatchResult | null }) {
  if (!result) {
    return (
      <div {...stylex.props(styles.batch)}>
        <h3 {...stylex.props(ui.subTitle)}>最近批次</h3>
        <p {...stylex.props(ui.muted)}>尚未送礼。</p>
      </div>
    );
  }
  const effects = Object.entries(result.effects) as [keyof typeof EFFECT_INFO, number][];
  return (
    <div {...stylex.props(styles.batch)} data-testid={`batch-${result.side}`}>
      <h3 {...stylex.props(ui.subTitle)}>
        最近批次 · {result.count} 份（概率 {percent(result.triggerProbability)}）
      </h3>
      {result.hits === 0 ? <p {...stylex.props(styles.notice)}>未触发，队列没有改变。</p> : null}
      {result.overflowEnergy > 0 ? (
        <p {...stylex.props(styles.notice, styles.warn)}>
          已触发，但容量已满，仅记录贡献（{result.overflowEnergy} 点）。
        </p>
      ) : null}
      {/* A type promotes at most once per batch, so it is a stable key. */}
      {result.promotedEffects.map((type) => (
        <p key={type} {...stylex.props(styles.notice, styles.promote)}>
          插队：{effectName(type)}升到 Lv.2 后前移一位。
        </p>
      ))}
      <dl {...stylex.props(ui.statGrid)}>
        <Stat label="触发" value={result.hits} />
        <Stat label="未触发" value={result.misses} />
        <Stat label="入队/合并" value={result.queuedEnergy} />
        <Stat label="进入储备" value={result.reservedEnergy} />
        <Stat label="溢出记账" value={result.overflowEnergy} />
        <Stat label="成功插队" value={result.promotions} />
      </dl>
      {effects.length > 0 && (
        <p {...stylex.props(ui.muted)}>
          抽中：{effects.map(([type, n]) => `${effectName(type)}×${n}`).join('、')}
        </p>
      )}
    </div>
  );
}

function QueueSlot({
  index,
  node,
  locksUntil,
}: {
  index: number;
  node: EffectNode | null;
  locksUntil: number;
}) {
  const locked = index === 0;
  return (
    <li
      {...stylex.props(styles.slot, locked && styles.slotLocked)}
      data-testid={`slot-${index}`}
      aria-label={
        node
          ? `第 ${index + 1} 位：${effectName(node.type)} Lv.${levelOf(node.energy)}`
          : `第 ${index + 1} 位：空`
      }
    >
      <div {...stylex.props(styles.slotHead)}>
        <span {...stylex.props(ui.muted)}>
          #{index + 1} · {locksUntil} 块后
        </span>
        {node && locked && (
          <span {...stylex.props(styles.tag, styles.tagLock)}>🔒 锁定·不再强化</span>
        )}
      </div>
      {node ? (
        <>
          <div {...stylex.props(styles.slotName)}>
            {effectName(node.type)}{' '}
            <span {...stylex.props(styles.level)}>Lv.{levelOf(node.energy)}</span>
          </div>
          <div
            {...stylex.props(styles.energyBar)}
            role="meter"
            aria-label="能量"
            aria-valuemin={0}
            aria-valuemax={CONFIG.queue.nodeMaxEnergy}
            aria-valuenow={node.energy}
          >
            <div {...stylex.props(styles.energyFill(node.energy / CONFIG.queue.nodeMaxEnergy))} />
          </div>
          <div {...stylex.props(styles.slotMeta)}>
            <span>
              能量 {node.energy}/{CONFIG.queue.nodeMaxEnergy}
            </span>
            {node.type === 'garbage' && (
              <span>
                净垃圾 {netGarbage(node)} 行
                {node.canceledLines > 0 && `（已抵消 ${node.canceledLines}）`}
              </span>
            )}
            {node.promoted && <span {...stylex.props(styles.tag, styles.tagPromote)}>已插队</span>}
            {node.waitedSettlements >= CONFIG.queue.waitProtection && (
              <span {...stylex.props(styles.tag)}>等待保护</span>
            )}
            {node.waitedSettlements > 0 && <span>已等待 {node.waitedSettlements} 次</span>}
          </div>
        </>
      ) : (
        <div {...stylex.props(ui.muted)}>空</div>
      )}
    </li>
  );
}

const styles = stylex.create({
  panel: {
    borderTopWidth: 4,
  },
  blessAccent: { borderTopColor: colors.bless },
  curseAccent: { borderTopColor: colors.curse },
  title: {
    margin: 0,
    fontSize: 20,
  },
  blessText: { color: colors.bless },
  curseText: { color: colors.curse },
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
  blessButton: {
    borderColor: colors.bless,
    backgroundColor: {
      default: colors.blessSoft,
      ':hover': 'rgba(52, 211, 153, 0.25)',
    },
  },
  curseButton: {
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
  batch: {
    gap: 6,
    display: 'flex',
    flexDirection: 'column',
  },
  notice: {
    margin: 0,
    borderRadius: 6,
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: colors.panelRaised,
    fontSize: 13,
  },
  warn: { color: colors.warn },
  promote: { color: colors.accent },
  queue: {
    margin: 0,
    padding: 0,
    gap: 6,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  slot: {
    borderColor: colors.border,
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    gap: 4,
    paddingBlock: 8,
    paddingInline: 10,
    backgroundColor: colors.panelRaised,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 64,
  },
  slotLocked: {
    borderColor: colors.warn,
  },
  slotHead: {
    alignItems: 'center',
    display: 'flex',
    fontSize: 12,
    justifyContent: 'space-between',
  },
  slotName: {
    fontSize: 15,
    fontWeight: 700,
  },
  level: {
    color: colors.warn,
  },
  energyBar: {
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.border,
    height: 5,
  },
  energyFill: (fraction: number) => ({
    backgroundColor: colors.accent,
    height: '100%',
    width: `${fraction * 100}%`,
  }),
  slotMeta: {
    gap: 8,
    color: colors.muted,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: 12,
  },
  tag: {
    borderRadius: 4,
    paddingBlock: 1,
    paddingInline: 6,
    backgroundColor: colors.border,
    color: colors.text,
    fontSize: 11,
  },
  tagLock: {
    color: colors.warn,
  },
  tagPromote: {
    color: colors.accent,
  },
  reserve: {
    margin: 0,
    padding: 0,
    gap: 4,
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
  },
  reserveItem: {
    borderRadius: 6,
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: colors.panelRaised,
    display: 'flex',
    fontSize: 13,
    justifyContent: 'space-between',
  },
});
