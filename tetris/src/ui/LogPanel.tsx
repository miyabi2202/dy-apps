import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { GameEngine, LogKind } from '../core/game';
import { ui } from './styles';
import { colors } from './tokens.stylex';

const Q = CONFIG.queue;

export function LogPanel({ engine }: { engine: GameEngine }) {
  return (
    <section aria-label="日志与规则" {...stylex.props(ui.panel, styles.panel)}>
      <h2 {...stylex.props(ui.subTitle)}>最近日志</h2>
      <ol aria-live="polite" data-testid="log" {...stylex.props(styles.log)}>
        {engine.log.length === 0 && <li {...stylex.props(ui.muted)}>暂无记录。</li>}
        {engine.log.map((entry) => (
          <li key={entry.id} {...stylex.props(styles.entry, kindStyle(entry.kind))}>
            {entry.text}
          </li>
        ))}
      </ol>
      <details {...stylex.props(styles.rules)}>
        <summary {...stylex.props(styles.summary)}>规则说明</summary>
        <ul {...stylex.props(styles.ruleList)}>
          <li>
            观众送「星光」。每份独立判定是否触发，命中后从四种诅咒效果中等概率抽取，产生 1 点能量。
          </li>
          <li>每落定 {CONFIG.settlement.everyLocks} 块，执行队头一个效果。空队列也推进周期。</li>
          <li>
            队列最多 {Q.capacity} 个槽位。第 1
            位锁定，不再强化也不会被越过。未锁定区同类效果合并，每个最多 {Q.nodeMaxEnergy} 点：1–2
            点 Lv.1，3–6 点 Lv.2，7 点 Lv.3。
          </li>
          <li>
            第 3 位的效果达到 Lv.2 时可向前插队一次；已等待 {Q.waitProtection}{' '}
            次结算的效果不会被越过。
          </li>
          <li>
            放不进队列的能量进入储备（共 {Q.reserveCapacity}{' '}
            点），只在结算时补位；储备满后的能量只记账，不产生效果。
          </li>
          <li>主播一次消 N 行，可抵消队列中最多 N 行待执行垃圾（由近到远）。</li>
        </ul>
      </details>
    </section>
  );
}

function kindStyle(kind: LogKind) {
  switch (kind) {
    case 'miss':
      return styles.miss;
    case 'overflow':
      return styles.overflow;
    case 'promote':
      return styles.promote;
    case 'settle':
      return styles.settle;
    case 'cancel':
      return styles.cancel;
    default:
      return null;
  }
}

const styles = stylex.create({
  panel: {
    gap: 8,
  },
  log: {
    margin: 0,
    padding: 0,
    gap: 4,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    fontSize: 13,
  },
  entry: {
    borderInlineStartColor: colors.border,
    borderInlineStartStyle: 'solid',
    borderInlineStartWidth: 3,
    lineHeight: 1.5,
    paddingInlineStart: 8,
  },
  miss: { color: colors.muted },
  overflow: { borderInlineStartColor: colors.warn, color: colors.warn },
  promote: { borderInlineStartColor: colors.accent },
  settle: { borderInlineStartColor: colors.warn },
  cancel: { borderInlineStartColor: colors.accent },
  rules: {
    fontSize: 13,
  },
  summary: {
    color: colors.accent,
    cursor: 'pointer',
  },
  ruleList: {
    marginBlock: 6,
    lineHeight: 1.7,
    paddingInlineStart: 18,
  },
});
