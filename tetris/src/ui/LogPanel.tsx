import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { GameEngine, LogKind } from '../core/game';
import { ui } from './styles';
import { colors } from './tokens.stylex';

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
            观众送「星光」。每份独立判定是否触发，命中后从四种诅咒中等概率抽取一个，加入待执行数量。
          </li>
          <li>
            每落定 {CONFIG.settlement.everyLocks} 块结算一次：每种有待执行数量的诅咒各执行 1
            个，其余继续等待。空队列也推进周期。
          </li>
          <li>
            垃圾行：底部加 1 行；加速：下降间隔永久 ×{CONFIG.gravity.hasteMultiplier}
            并叠加，最快 {CONFIG.gravity.minMs} ms/格；迷雾：隐藏预览 1 块；封存：禁用暂存 1 块。
          </li>
          <li>主播一次消 N 行，可抵消最多 N 个待执行的垃圾行。</li>
        </ul>
      </details>
    </section>
  );
}

function kindStyle(kind: LogKind) {
  switch (kind) {
    case 'miss':
      return styles.miss;
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
