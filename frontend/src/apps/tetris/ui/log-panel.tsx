import { Panel, text } from '@dy-apps/ui';
import { colors, fontSize, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { GameEngine, LogKind } from '../core/game';
import { testIds } from '../messages';

export function LogPanel({ engine }: { engine: GameEngine }) {
  return (
    <Panel aria-label="日志与规则" title="最近日志" gap="md">
      <ol aria-live="polite" data-testid={testIds.log} {...stylex.props(styles.log)}>
        {engine.log.length === 0 && <li {...stylex.props(text.muted)}>暂无记录。</li>}
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
            观众送出的礼物每 1
            钻独立判定是否触发，命中后从四种诅咒中等概率抽取一个，加入待执行数量。
          </li>
          <li>
            每落定 {CONFIG.settlement.everyLocks} 块结算一次：每种有待执行数量的诅咒各执行 1
            个，其余继续等待。空队列也推进周期。
          </li>
          <li>
            垃圾行：底部加 1 行；加速：下降间隔永久 ×{CONFIG.gravity.hasteMultiplier}
            并叠加，最快 {CONFIG.gravity.minMs} ms/格；迷雾：隐藏预览 {CONFIG.effects.fogLocks}{' '}
            块；封存：禁用暂存 {CONFIG.effects.sealLocks} 块；再次触发会重新计时。
          </li>
        </ul>
      </details>
    </Panel>
  );
}

function kindStyle(kind: LogKind) {
  switch (kind) {
    case 'miss':
      return styles.miss;
    case 'settle':
      return styles.settle;
    default:
      return null;
  }
}

const styles = stylex.create({
  log: {
    margin: 0,
    padding: 0,
    gap: space.xs,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    fontSize: fontSize.sm,
  },
  entry: {
    borderInlineStartColor: colors.border,
    borderInlineStartStyle: 'solid',
    borderInlineStartWidth: 3,
    lineHeight: 1.5,
    paddingInlineStart: space.md,
  },
  miss: { color: colors.muted },
  settle: { borderInlineStartColor: colors.warn },
  rules: {
    fontSize: fontSize.sm,
  },
  summary: {
    color: colors.accent,
    cursor: 'pointer',
  },
  ruleList: {
    marginBlock: space.sm,
    lineHeight: 1.7,
    paddingInlineStart: space.xl,
  },
});
