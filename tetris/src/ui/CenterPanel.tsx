import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, type RefObject } from 'react';
import { CONFIG } from '../core/config';
import type { GameEngine } from '../core/game';
import { netGarbage } from '../core/interventions';
import type { PieceType } from '../core/types';
import { drawMiniPiece } from '../render/board';
import { nodeLabel } from './format';
import { ui } from './styles';
import { colors } from './tokens.stylex';

interface Props {
  engine: GameEngine;
  boardRef: RefObject<HTMLCanvasElement | null>;
  onRestart: () => void;
}

const fadeIn = stylex.keyframes({
  from: { backgroundColor: 'rgba(251, 191, 36, 0.45)' },
  to: { backgroundColor: 'rgba(251, 191, 36, 0)' },
});

export function CenterPanel({ engine, boardRef, onRestart }: Props) {
  const every = CONFIG.settlement.everyLocks;
  const done = engine.lockedPieceCount % every;
  const { effects } = engine;

  const timed: string[] = [];
  if (effects.slow)
    timed.push(`缓速 Lv.${effects.slow.level} · 剩 ${effects.slow.remainingLocks} 块`);
  if (effects.haste)
    timed.push(`加速 Lv.${effects.haste.level} · 剩 ${effects.haste.remainingLocks} 块`);
  if (effects.fog) timed.push(`迷雾 · 剩 ${effects.fog.remainingLocks} 块`);
  if (effects.seal) timed.push(`封存 · 剩 ${effects.seal.remainingLocks} 块`);
  if (effects.longCredits) timed.push(`长条补给 · 剩 ${effects.longCredits} 个`);

  const nextBless = engine.teams.bless.queue[0];
  const nextCurse = engine.teams.curse.queue[0];

  return (
    <section aria-label="棋盘" {...stylex.props(ui.panel, styles.center)}>
      <div
        key={engine.settlementCount}
        data-testid="countdown"
        {...stylex.props(styles.countdown, engine.settlementCount > 0 && styles.flash)}
      >
        <span>
          再落下 <strong>{engine.piecesUntilSettlement}</strong> 块，双方结算
        </span>
        <span {...stylex.props(styles.pips)} aria-hidden>
          {Array.from({ length: every }, (_, i) => (
            <span key={i} {...stylex.props(styles.pip, i < done && styles.pipOn)} />
          ))}
        </span>
      </div>

      <div {...stylex.props(styles.playArea)}>
        <div {...stylex.props(styles.side, styles.holdSide)}>
          <div {...stylex.props(ui.subTitle)}>暂存{engine.holdBlocked && '（封存中）'}</div>
          <MiniPiece type={engine.hold} dim={engine.holdBlocked || !engine.canHold} label="暂存" />
        </div>

        <div {...stylex.props(styles.boardWrap)}>
          <canvas
            ref={boardRef}
            data-testid="board"
            aria-label="游戏棋盘"
            role="img"
            {...stylex.props(styles.board)}
          />
          <Overlay engine={engine} onRestart={onRestart} />
        </div>

        <div {...stylex.props(styles.side, styles.nextSide)}>
          <div {...stylex.props(ui.subTitle)}>后续</div>
          {engine.previewHidden ? (
            <div {...stylex.props(styles.fog)} data-testid="preview-fog">
              迷雾
              <br />
              预览隐藏
            </div>
          ) : (
            <div {...stylex.props(styles.previewList)} data-testid="preview">
              {engine.preview.map((type, i) => (
                // Preview slots are positional; the index is the identity.
                // eslint-disable-next-line @eslint-react/no-array-index-key
                <MiniPiece key={i} type={type} label={`第 ${i + 1} 个`} />
              ))}
            </div>
          )}
        </div>
      </div>

      <dl {...stylex.props(ui.statGrid)} data-testid="stats">
        <Stat label="分数" value={engine.score} />
        <Stat label="消行" value={engine.lines} />
        <Stat label="落块" value={engine.lockedPieceCount} />
        <Stat label="护盾" value={`${effects.shield}/${CONFIG.effects.shieldMax}`} />
      </dl>

      <div {...stylex.props(styles.infoRow)}>
        <div>
          <div {...stylex.props(ui.subTitle)}>生效中</div>
          <div data-testid="active-effects" {...stylex.props(styles.infoText)}>
            {timed.length ? timed.join('；') : '无'}
          </div>
        </div>
        <div>
          <div {...stylex.props(ui.subTitle)}>下次结算（已锁定）</div>
          <div {...stylex.props(styles.infoText)} data-testid="next-locked">
            <span {...stylex.props(styles.blessText)}>
              祝福：{nextBless ? nodeLabel(nextBless) : '无'}
            </span>
            <br />
            <span {...stylex.props(styles.curseText)}>
              诅咒：
              {nextCurse
                ? `${nodeLabel(nextCurse)}${nextCurse.type === 'garbage' ? `（净 ${netGarbage(nextCurse)} 行）` : ''}`
                : '无'}
            </span>
          </div>
        </div>
      </div>

      <TouchControls engine={engine} />
      <p {...stylex.props(ui.muted, styles.keys)}>
        ←/→ 移动 · ↑/X 顺时针 · Z 逆时针 · ↓ 软降 · 空格 硬降 · C 暂存 · P 暂停
      </p>
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

function MiniPiece({
  type,
  dim = false,
  label,
}: {
  type: PieceType | null;
  dim?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMiniPiece(ref.current, type, dim);
  }, [type, dim]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`${label}：${type ?? '空'}`}
      data-piece={type ?? ''}
      {...stylex.props(styles.mini)}
    />
  );
}

function Overlay({ engine, onRestart }: { engine: GameEngine; onRestart: () => void }) {
  if (engine.phase === 'playing') return null;
  return (
    <div {...stylex.props(styles.overlay)} data-testid={`overlay-${engine.phase}`}>
      {engine.phase === 'ready' && (
        <>
          <strong {...stylex.props(styles.overlayTitle)}>准备就绪</strong>
          <span {...stylex.props(ui.muted)}>开始前也可以先模拟送礼</span>
          <button
            type="button"
            onClick={() => engine.start()}
            {...stylex.props(ui.button, ui.primary)}
          >
            开始游戏
          </button>
        </>
      )}
      {engine.phase === 'paused' && (
        <>
          <strong {...stylex.props(styles.overlayTitle)}>已暂停</strong>
          <span {...stylex.props(ui.muted)}>暂停期间仍可送礼，但不结算</span>
          <button
            type="button"
            onClick={() => engine.resume()}
            {...stylex.props(ui.button, ui.primary)}
          >
            继续游戏
          </button>
        </>
      )}
      {engine.phase === 'gameOver' && (
        <>
          <strong {...stylex.props(styles.overlayTitle)}>游戏结束</strong>
          <span>{engine.gameOverReason}</span>
          <dl {...stylex.props(styles.summaryList)} data-testid="game-over-summary">
            <dt>分数</dt>
            <dd>{engine.score}</dd>
            <dt>消行</dt>
            <dd>{engine.lines}</dd>
            <dt>结算次数</dt>
            <dd>{engine.settlementCount}</dd>
          </dl>
          <button type="button" onClick={onRestart} {...stylex.props(ui.button, ui.primary)}>
            重新开始
          </button>
        </>
      )}
    </div>
  );
}

function TouchControls({ engine }: { engine: GameEngine }) {
  const disabled = engine.phase !== 'playing';
  const buttons: [string, () => void][] = [
    ['左移', () => engine.move(-1)],
    ['右移', () => engine.move(1)],
    ['旋转', () => engine.rotate(1)],
    ['暂存', () => engine.holdPiece()],
    ['硬降', () => engine.hardDrop()],
  ];
  return (
    <div {...stylex.props(styles.touch)} role="group" aria-label="鼠标/触屏操作">
      {buttons.map(([label, act]) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={act}
          {...stylex.props(ui.button)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const styles = stylex.create({
  center: {
    alignItems: 'stretch',
  },
  countdown: {
    borderRadius: 8,
    paddingBlock: 6,
    paddingInline: 10,
    alignItems: 'center',
    display: 'flex',
    fontSize: 15,
    justifyContent: 'space-between',
  },
  flash: {
    animationDuration: '900ms',
    animationName: fadeIn,
  },
  pips: {
    gap: 4,
    display: 'flex',
  },
  pip: {
    borderRadius: 999,
    backgroundColor: colors.border,
    height: 10,
    width: 22,
  },
  pipOn: {
    backgroundColor: colors.warn,
  },
  playArea: {
    gap: 10,
    gridTemplateAreas: {
      default: '"hold next" "board board"',
      '@media (min-width: 520px)': '"hold board next"',
    },
    display: 'grid',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr) minmax(0, 3fr)',
      '@media (min-width: 520px)': '76px auto 76px',
    },
    justifyContent: 'center',
  },
  side: {
    gap: 6,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  holdSide: { gridArea: 'hold' },
  nextSide: { gridArea: 'next' },
  boardWrap: {
    gridArea: 'board',
    justifySelf: 'center',
    position: 'relative',
    width: 'min(300px, 100%)',
  },
  board: {
    borderColor: colors.border,
    borderRadius: 6,
    borderStyle: 'solid',
    borderWidth: 1,
    aspectRatio: '1 / 2',
    display: 'block',
    width: '100%',
  },
  mini: {
    borderRadius: 6,
    backgroundColor: colors.panelRaised,
    display: 'block',
    height: 44,
    maxWidth: 76,
    minWidth: 0,
    width: '100%',
  },
  previewList: {
    gap: 6,
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(3, minmax(0, 1fr))',
      '@media (min-width: 520px)': 'minmax(0, 1fr)',
    },
  },
  fog: {
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
    color: colors.muted,
    display: 'flex',
    fontSize: 13,
    justifyContent: 'center',
    textAlign: 'center',
    minHeight: 100,
  },
  overlay: {
    inset: 0,
    padding: 16,
    borderRadius: 6,
    gap: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(10, 15, 28, 0.82)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    position: 'absolute',
    textAlign: 'center',
  },
  overlayTitle: {
    fontSize: 22,
  },
  summaryList: {
    margin: 0,
    columnGap: 12,
    display: 'grid',
    gridTemplateColumns: 'auto auto',
    rowGap: 2,
  },
  infoRow: {
    gap: 10,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  },
  infoText: {
    fontSize: 13,
    lineHeight: 1.6,
    marginTop: 2,
  },
  blessText: { color: colors.bless },
  curseText: { color: colors.curse },
  touch: {
    gap: 6,
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
  },
  keys: {
    margin: 0,
    textAlign: 'center',
  },
});
