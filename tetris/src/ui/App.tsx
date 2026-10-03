import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import type { LocalGiftAdapter } from '../adapters/local-gift';
import { CONFIG } from '../core/config';
import type { GameEngine } from '../core/game';
import type { KeyboardController } from '../input/keyboard';
import { startGameLoop } from '../loop';
import { CenterPanel } from './CenterPanel';
import { percent } from './format';
import { LogPanel } from './LogPanel';
import { ui } from './styles';
import { TeamPanel } from './TeamPanel';
import { colors } from './tokens.stylex';
import { useEngineVersion } from './useEngine';

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

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div>
          <h1 {...stylex.props(styles.title)}>方块干预实验室</h1>
          <span {...stylex.props(styles.badge)}>单机测试 · 本地模拟送礼，未连接直播</span>
        </div>
        <div {...stylex.props(styles.controls)}>
          <label {...stylex.props(ui.muted, styles.probLabel)}>
            礼物触发概率
            <select
              value={engine.probability}
              onChange={(e) => engine.setProbability(Number(e.target.value))}
              {...stylex.props(ui.input, styles.select)}
            >
              {CONFIG.gifts.probabilityOptions.map((p) => (
                <option key={p} value={p}>
                  {percent(p)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={engine.phase === 'gameOver'}
            onClick={phaseButton.act}
            {...stylex.props(ui.button, ui.primary)}
          >
            {phaseButton.label}
          </button>
          <button type="button" onClick={requestRestart} {...stylex.props(ui.button)}>
            重新开始
          </button>
        </div>
      </header>

      <main {...stylex.props(styles.columns)}>
        <div {...stylex.props(styles.bless)}>
          <TeamPanel engine={engine} gifts={gifts} side="bless" />
        </div>
        <div {...stylex.props(styles.centerCol)}>
          <CenterPanel engine={engine} boardRef={boardRef} onRestart={requestRestart} />
        </div>
        <div {...stylex.props(styles.curse)}>
          <TeamPanel engine={engine} gifts={gifts} side="curse" />
        </div>
      </main>

      <LogPanel engine={engine} />

      {confirming && (
        <div {...stylex.props(styles.backdrop)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="restart-title"
            {...stylex.props(ui.panel, styles.dialog)}
          >
            <h2 id="restart-title" {...stylex.props(styles.dialogTitle)}>
              确认重新开始？
            </h2>
            <p {...stylex.props(ui.muted)}>
              将清空棋盘、分数、队列、储备、效果和送礼记录。触发概率保持{' '}
              {percent(engine.probability)}。
            </p>
            <div {...stylex.props(styles.dialogButtons)}>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirming(false)}
                {...stylex.props(ui.button)}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  engine.restart();
                }}
                {...stylex.props(ui.button, ui.primary)}
              >
                确认重开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const WIDE = '@media (min-width: 1100px)';

const styles = stylex.create({
  page: {
    gap: 14,
    marginInline: 'auto',
    paddingBlock: 16,
    paddingInline: 16,
    backgroundColor: colors.bg,
    color: colors.text,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    maxWidth: 1440,
    minHeight: '100vh',
  },
  header: {
    gap: 12,
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  title: {
    margin: 0,
    fontSize: 24,
  },
  badge: {
    color: colors.muted,
    fontSize: 13,
  },
  controls: {
    gap: 8,
    alignItems: 'flex-end',
    display: 'flex',
    flexWrap: 'wrap',
  },
  probLabel: {
    gap: 2,
    display: 'flex',
    flexDirection: 'column',
  },
  select: {
    width: 96,
  },
  columns: {
    gap: 14,
    gridTemplateAreas: {
      [WIDE]: '"bless center curse"',
      default: '"center" "bless" "curse"',
    },
    alignItems: 'start',
    display: 'grid',
    gridTemplateColumns: {
      [WIDE]: 'minmax(280px, 1fr) minmax(0, 520px) minmax(280px, 1fr)',
      default: 'minmax(0, 1fr)',
    },
  },
  bless: { gridArea: 'bless', minWidth: 0 },
  centerCol: { gridArea: 'center', minWidth: 0 },
  curse: { gridArea: 'curse', minWidth: 0 },
  backdrop: {
    inset: 0,
    padding: 16,
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
    fontSize: 18,
  },
  dialogButtons: {
    gap: 8,
    display: 'flex',
    justifyContent: 'flex-end',
  },
});
