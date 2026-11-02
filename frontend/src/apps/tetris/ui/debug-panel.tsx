import { createFakeGift } from '@dy-apps/services';
import { Button, Disclosure, Row, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import { RARITIES } from '../core/curses';
import type { GameEngine, ViewerCommand } from '../core/game';
import type { Sender } from '../core/types';
import { labels, testIds } from '../messages';
import { CurseName } from './curse-name';

/**
 * Debug: a button per curse in play that queues one, as if a gift had triggered it, grouped by
 * rarity and marked with its settlement queue; and buttons that send a made-up viewer's chat
 * command, for trying 夺舍 without a live room. Only on the config page, never in OBS; like
 * gifts, it works only during a game.
 */
export function DebugPanel({ engine }: { engine: GameEngine }) {
  const running = engine.phase === 'playing' || engine.phase === 'paused';
  return (
    <Disclosure summary={labels.debug}>
      <p {...stylex.props(text.muted, styles.hint)}>
        {running ? '点一下加入 1 个待执行，下次结算时照常执行。' : '开始游戏后才能添加。'}
      </p>
      {RARITIES.map((rarity) => {
        const defs = engine.curses
          .filter((def) => def.rarity === rarity)
          .sort((a, b) => a.queue.localeCompare(b.queue));
        if (defs.length === 0) return null;
        return (
          <section key={rarity} {...stylex.props(styles.group)}>
            <h4 {...stylex.props(text.muted, styles.rarity)}>{rarity}</h4>
            <div {...stylex.props(styles.grid)}>
              {defs.map((def) => (
                <Button
                  key={def.type}
                  disabled={!running}
                  onClick={() => engine.addCurse(def.type, fakeSender())}
                  data-testid={testIds.debugCurse(def.type)}
                  title={`队列 ${def.queue}`}
                  xstyle={styles.button}
                >
                  + <CurseName def={def} />
                  <span {...stylex.props(styles.queue)}>{def.queue}</span>
                </Button>
              ))}
            </div>
          </section>
        );
      })}
      <section {...stylex.props(styles.group)}>
        <h4 {...stylex.props(text.muted, styles.rarity)}>模拟观众弹幕（夺舍时生效）</h4>
        <Row gap="xs">
          {(Object.keys(CONFIG.viewerCommands) as ViewerCommand[]).map((command) => {
            const word = CONFIG.viewerCommands[command];
            return (
              <Button
                key={command}
                disabled={!running}
                onClick={() => engine.viewerCommand(createFakeGift().user.nickname, word)}
                data-testid={testIds.debugViewer(command)}
              >
                {word}
              </Button>
            );
          })}
        </Row>
      </section>
    </Disclosure>
  );
}

/** A made-up viewer, so a curse added here shows a sender in its animations like a gift's would. */
function fakeSender(): Sender {
  const { id, nickname, avatarUrl } = createFakeGift().user;
  return { id, name: nickname, avatarUrl };
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
  group: {
    marginBlockEnd: space.sm,
  },
  rarity: {
    margin: 0,
    fontSize: fontSize.sm,
    fontWeight: 600,
    marginBlockEnd: space.xs,
  },
  button: {
    paddingInline: space.sm,
    position: 'relative',
  },
  queue: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingInline: space.xs,
    color: colors.muted,
    fontSize: fontSize.xs,
    marginInlineStart: space.xs,
  },
});
