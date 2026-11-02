import { Button, Disclosure, text } from '@dy-apps/ui';
import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { GameEngine } from '../core/game';
import { labels, testIds } from '../messages';
import { CurseName } from './curse-name';

/**
 * Debug: a button per curse in play that queues one, as if a gift had triggered it. Only on the
 * config page, never in OBS; like gifts, it works only during a game.
 */
export function DebugPanel({ engine }: { engine: GameEngine }) {
  const running = engine.phase === 'playing' || engine.phase === 'paused';
  return (
    <Disclosure summary={labels.debug}>
      <p {...stylex.props(text.muted, styles.hint)}>
        {running ? '点一下加入 1 个待执行，下次结算时照常执行。' : '开始游戏后才能添加。'}
      </p>
      <div {...stylex.props(styles.grid)}>
        {engine.curses.map((def) => (
          <Button
            key={def.type}
            disabled={!running}
            onClick={() => engine.addCurse(def.type)}
            data-testid={testIds.debugCurse(def.type)}
            xstyle={styles.button}
          >
            + <CurseName def={def} />
          </Button>
        ))}
      </div>
    </Disclosure>
  );
}

const styles = stylex.create({
  hint: {
    marginBlock: space.sm,
  },
  grid: {
    gap: space.xs,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
  },
  button: {
    paddingInline: space.sm,
  },
});
