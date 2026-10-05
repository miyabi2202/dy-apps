import { Button, Column, Field, Page, Panel, Row, Select, text } from '@dy-apps/ui';
import { colors, fontSize, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import type { LocalGiftAdapter } from '../adapters/local-gift';
import { CONFIG } from '../core/config';
import type { GameEngine } from '../core/game';
import type { KeyboardController } from '../input/keyboard';
import { startGameLoop } from '../loop';
import { CenterPanel } from './center-panel';
import { DyhubPanel } from './dyhub-panel';
import { percent } from './format';
import { LogPanel } from './log-panel';
import { TeamPanel } from './team-panel';
import { useEngineVersion } from './use-engine';

interface Props {
  engine: GameEngine;
  gifts: LocalGiftAdapter;
  keyboard: KeyboardController;
}

export function App({ engine, gifts, keyboard }: Props) {
  useEngineVersion(engine);
  const boardRef = useRef<HTMLCanvasElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => keyboard.attach(window), [keyboard]);
  useEffect(() => startGameLoop(engine, keyboard, () => boardRef.current), [engine, keyboard]);

  const requestRestart = () => {
    if (engine.hasProgress) setConfirming(true);
    else engine.restart();
  };

  const phaseButton =
    engine.phase === 'ready'
      ? { label: '开始', act: () => engine.start() }
      : engine.phase === 'paused'
        ? { label: '继续', act: () => engine.resume() }
        : { label: '暂停', act: () => engine.pause() };

  const controls = (
    <Row gap="md" align="end" wrap>
      <Field label="礼物触发概率" xstyle={styles.probField}>
        <Select
          value={engine.probability}
          onChange={(e) => engine.setProbability(Number(e.target.value))}
        >
          {CONFIG.gifts.probabilityOptions.map((p) => (
            <option key={p} value={p}>
              {percent(p)}
            </option>
          ))}
        </Select>
      </Field>
      <Button variant="primary" disabled={engine.phase === 'gameOver'} onClick={phaseButton.act}>
        {phaseButton.label}
      </Button>
      <Button onClick={requestRestart}>重新开始</Button>
    </Row>
  );

  return (
    <Page
      title="方块干预实验室"
      subtitle="单机测试 · 本地模拟送礼，未连接直播"
      actions={controls}
      xstyle={styles.page}
    >
      <Column gap="lg">
        <main {...stylex.props(styles.columns)}>
          <div {...stylex.props(styles.centerCol)}>
            <CenterPanel engine={engine} boardRef={boardRef} onRestart={requestRestart} />
          </div>
          <div {...stylex.props(styles.teamCol)}>
            <TeamPanel engine={engine} gifts={gifts} />
          </div>
        </main>

        <LogPanel engine={engine} />

        <DyhubPanel />

        {confirming && (
          <div {...stylex.props(styles.backdrop)}>
            <Panel
              role="dialog"
              aria-modal="true"
              aria-labelledby="restart-title"
              xstyle={styles.dialog}
            >
              <h2 id="restart-title" {...stylex.props(styles.dialogTitle)}>
                确认重新开始？
              </h2>
              <p {...stylex.props(text.muted, styles.dialogText)}>
                将清空棋盘、分数、待执行诅咒、效果和送礼记录。触发概率保持{' '}
                {percent(engine.probability)}。
              </p>
              <Row gap="md" justify="end">
                <Button autoFocus onClick={() => setConfirming(false)}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirming(false);
                    engine.restart();
                  }}
                >
                  确认重开
                </Button>
              </Row>
            </Panel>
          </div>
        )}
      </Column>
    </Page>
  );
}

const WIDE = '@media (min-width: 900px)';

const styles = stylex.create({
  page: {
    padding: space.xl,
    marginInline: 'auto',
    maxWidth: 1440,
  },
  probField: {
    width: 96,
  },
  columns: {
    gap: space.lg,
    gridTemplateAreas: {
      [WIDE]: '"center team"',
      default: '"center" "team"',
    },
    alignItems: 'start',
    display: 'grid',
    gridTemplateColumns: {
      [WIDE]: 'minmax(0, 520px) minmax(320px, 560px)',
      default: 'minmax(0, 1fr)',
    },
    justifyContent: 'center',
  },
  centerCol: { gridArea: 'center', minWidth: 0 },
  teamCol: { gridArea: 'team', minWidth: 0 },
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
