import { Button, Panel, Row, text } from '@dy-apps/ui';
import { colors, fontSize, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import type { GameEngine } from '../core/game';
import type { GiftFeed } from '../gift-feed';
import { percent } from './format';

/**
 * Restarting a game in progress asks first; after game over, or before anything has
 * happened, it just restarts. Returns the function that asks (or restarts), and the dialog
 * to render, which is null while not asking.
 */
export function useRestart(engine: GameEngine, feed: GiftFeed) {
  const [confirming, setConfirming] = useState(false);

  const restart = () => {
    engine.restart();
    feed.clear();
  };

  const requestRestart = () => {
    if (engine.hasProgress && engine.phase !== 'gameOver') setConfirming(true);
    else restart();
  };

  const dialog = confirming && (
    <div {...stylex.props(styles.backdrop)}>
      <Panel role="dialog" aria-modal="true" aria-labelledby="restart-title" xstyle={styles.dialog}>
        <h2 id="restart-title" {...stylex.props(styles.dialogTitle)}>
          确认重新开始？
        </h2>
        <p {...stylex.props(text.muted, styles.dialogText)}>
          将清空棋盘、分数、待执行诅咒、效果和送礼记录。触发概率保持 {percent(engine.probability)}。
        </p>
        <Row gap="md" justify="end">
          <Button autoFocus onClick={() => setConfirming(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setConfirming(false);
              restart();
            }}
          >
            确认重开
          </Button>
        </Row>
      </Panel>
    </div>
  );

  return { requestRestart, dialog };
}

const styles = stylex.create({
  backdrop: {
    inset: 0,
    padding: space.xl,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    justifyContent: 'center',
    position: 'fixed',
    zIndex: 10,
  },
  dialog: {
    maxWidth: 380,
  },
  dialogTitle: {
    margin: 0,
    color: colors.text,
    fontSize: 18,
  },
  dialogText: {
    margin: 0,
    fontSize: fontSize.md,
    lineHeight: 1.6,
  },
});
