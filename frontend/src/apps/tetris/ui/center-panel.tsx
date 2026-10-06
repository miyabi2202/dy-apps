import { Button, Grid, Panel, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, type RefObject } from 'react';
import { CONFIG } from '../core/config';
import type { GameEngine } from '../core/game';
import { shapeOf } from '../core/pieces';
import type { PieceShape } from '../core/types';
import { labels, testIds } from '../messages';
import { drawMiniPiece } from '../render/board';
import { effectName } from './format';

interface Props {
  engine: GameEngine;
  boardRef: RefObject<HTMLCanvasElement | null>;
  onRestart: () => void;
  /** For viewers on the OBS page: no touch buttons or key hints. */
  viewer?: boolean;
}

const fadeIn = stylex.keyframes({
  from: { backgroundColor: `color-mix(in srgb, ${colors.warn} 45%, transparent)` },
  to: { backgroundColor: 'transparent' },
});

export function CenterPanel({ engine, boardRef, onRestart, viewer = false }: Props) {
  const every = CONFIG.settlement.everyLocks;
  const done = engine.lockedPieceCount % every;
  const timed = engine.activeCurses.map(
    ({ def, remainingLocks, count }) =>
      `${def.name}${count > 1 ? ` ×${count}` : ''} · 剩 ${remainingLocks} 块`,
  );
  const holdBlockedBy = engine.blockedBy('hold');
  const previewHiddenBy = engine.previewHiddenBy;

  const firingNext = engine.curses
    .map((def) => def.type)
    .filter((type) => engine.team.pending[type] > 0);

  return (
    <Panel aria-label="棋盘">
      <div
        key={engine.settlementCount}
        data-testid={testIds.countdown}
        {...stylex.props(styles.countdown, engine.settlementCount > 0 && styles.flash)}
      >
        <span>
          再落下 <strong>{engine.piecesUntilSettlement}</strong> 块，诅咒结算
        </span>
        <span {...stylex.props(styles.pips)} aria-hidden>
          {Array.from({ length: every }, (_, i) => (
            <span key={i} {...stylex.props(styles.pip, i < done && styles.pipOn)} />
          ))}
        </span>
      </div>

      <div {...stylex.props(styles.playArea)}>
        <div {...stylex.props(styles.side, styles.holdSide)}>
          <div {...stylex.props(text.caption)}>
            暂存{holdBlockedBy && `（${holdBlockedBy.name}中）`}
          </div>
          <MiniPiece shape={engine.hold} dim={!!holdBlockedBy || !engine.canHold} label="暂存" />
        </div>

        <div {...stylex.props(styles.boardWrap)}>
          <canvas
            ref={boardRef}
            data-testid={testIds.board}
            aria-label="游戏棋盘"
            role="img"
            {...stylex.props(styles.board)}
          />
          <Overlay engine={engine} onRestart={onRestart} />
        </div>

        <div {...stylex.props(styles.side, styles.nextSide)}>
          <div {...stylex.props(text.caption)}>后续</div>
          {previewHiddenBy ? (
            <div {...stylex.props(styles.fog)} data-testid={testIds.previewFog}>
              {previewHiddenBy.name}
              <br />
              预览隐藏
            </div>
          ) : (
            <div {...stylex.props(styles.previewList)} data-testid={testIds.preview}>
              {engine.preview.map((type, i) => (
                // Preview slots are positional; the index is the identity.
                // eslint-disable-next-line @eslint-react/no-array-index-key
                <MiniPiece key={i} shape={shapeOf(type)} label={`第 ${i + 1} 个`} />
              ))}
            </div>
          )}
          <div {...stylex.props(text.caption, styles.speedTitle)}>速度</div>
          <div data-testid={testIds.speed} {...stylex.props(styles.speed)}>
            ×{engine.speedMultiplier.toFixed(1)}
          </div>
        </div>
      </div>

      <dl {...stylex.props(styles.statGrid)} data-testid={testIds.stats}>
        <Stat label="分数" value={engine.score} />
        <Stat label="消行" value={engine.lines} />
        <Stat label="落块" value={engine.lockedPieceCount} />
        <Stat label="结算" value={engine.settlementCount} />
      </dl>

      <Grid min={160} gap="md">
        <div>
          <div {...stylex.props(text.caption)}>生效中</div>
          <div data-testid={testIds.activeEffects} {...stylex.props(styles.infoText)}>
            {timed.length ? timed.join('；') : '无'}
          </div>
        </div>
        <div>
          <div {...stylex.props(text.caption)}>下次结算（每种各 1 个）</div>
          <div
            {...stylex.props(styles.infoText, styles.curseText)}
            data-testid={testIds.nextSettlement}
          >
            {firingNext.length ? firingNext.map(effectName).join('、') : '无'}
          </div>
        </div>
      </Grid>

      {!viewer && (
        <>
          <TouchControls engine={engine} />
          <p {...stylex.props(text.muted, styles.keys)}>
            A/D 移动 · W 顺时针 · Q 逆时针 · S 软降 · 空格 硬降 · C 暂存 · P 暂停
          </p>
        </>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div {...stylex.props(styles.stat)}>
      <dt {...stylex.props(styles.statLabel)}>{label}</dt>
      <dd {...stylex.props(styles.statValue)}>{value}</dd>
    </div>
  );
}

function MiniPiece({
  shape,
  dim = false,
  label,
}: {
  shape: PieceShape | null;
  dim?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const type = shape?.type;
  useEffect(() => {
    if (ref.current) drawMiniPiece(ref.current, shape, dim);
  }, [shape, dim]);
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
    <div {...stylex.props(styles.overlay)} data-testid={testIds.overlay(engine.phase)}>
      {engine.phase === 'ready' && (
        <>
          <strong {...stylex.props(styles.overlayTitle)}>准备就绪</strong>
          <span {...stylex.props(text.muted)}>开始后送的礼物才会触发诅咒</span>
          <Button variant="primary" onClick={() => engine.start()}>
            {labels.start}
          </Button>
        </>
      )}
      {engine.phase === 'paused' && (
        <>
          <strong {...stylex.props(styles.overlayTitle)}>已暂停</strong>
          <span {...stylex.props(text.muted)}>暂停期间仍可送礼，但不结算</span>
          <Button variant="primary" onClick={() => engine.resume()}>
            {labels.resume}
          </Button>
        </>
      )}
      {engine.phase === 'gameOver' && (
        <>
          <strong {...stylex.props(styles.overlayTitle)}>游戏结束</strong>
          <span>{engine.gameOverReason}</span>
          <dl {...stylex.props(styles.summaryList)} data-testid={testIds.gameOverSummary}>
            <dt>分数</dt>
            <dd>{engine.score}</dd>
            <dt>消行</dt>
            <dd>{engine.lines}</dd>
            <dt>结算次数</dt>
            <dd>{engine.settlementCount}</dd>
          </dl>
          <Button variant="primary" onClick={onRestart}>
            {labels.restart}
          </Button>
        </>
      )}
    </div>
  );
}

function TouchControls({ engine }: { engine: GameEngine }) {
  const disabled = engine.phase !== 'playing';
  const rotateBlocked = engine.blockedBy('rotate') !== null;
  const buttons: [string, () => void, boolean][] = [
    ['左移', () => engine.move(-1), false],
    ['右移', () => engine.move(1), false],
    ['旋转', () => engine.rotate(1), rotateBlocked],
    ['暂存', () => engine.holdPiece(), false],
    ['硬降', () => engine.hardDrop(), false],
  ];
  return (
    <Grid columns={5} gap="sm" role="group" aria-label={labels.touchControls}>
      {buttons.map(([label, act, blocked]) => (
        <Button key={label} disabled={disabled || blocked} onClick={act}>
          {label}
        </Button>
      ))}
    </Grid>
  );
}

const styles = stylex.create({
  statGrid: {
    margin: 0,
    gap: space.sm,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
  },
  stat: {
    borderRadius: radius.sm,
    paddingBlock: space.xs,
    paddingInline: space.md,
    backgroundColor: colors.panelRaised,
  },
  statLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  statValue: {
    margin: 0,
    fontSize: fontSize.lg,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
  countdown: {
    borderRadius: radius.md,
    paddingBlock: space.sm,
    paddingInline: space.md,
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSize.lg,
    justifyContent: 'space-between',
  },
  flash: {
    animationDuration: '900ms',
    animationName: fadeIn,
  },
  pips: {
    gap: space.xs,
    display: 'flex',
  },
  pip: {
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    height: 10,
    width: 22,
  },
  pipOn: {
    backgroundColor: colors.warn,
  },
  playArea: {
    gap: space.md,
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
    gap: space.sm,
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
    borderRadius: radius.sm,
    borderStyle: 'solid',
    borderWidth: 1,
    aspectRatio: '1 / 2',
    display: 'block',
    width: '100%',
  },
  mini: {
    borderRadius: radius.sm,
    backgroundColor: colors.panelRaised,
    display: 'block',
    height: 44,
    maxWidth: 76,
    minWidth: 0,
    width: '100%',
  },
  previewList: {
    gap: space.sm,
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(3, minmax(0, 1fr))',
      '@media (min-width: 520px)': 'minmax(0, 1fr)',
    },
  },
  speedTitle: {
    marginTop: space.xs,
  },
  speed: {
    borderRadius: radius.sm,
    paddingBlock: space.sm,
    backgroundColor: colors.panelRaised,
    fontSize: 18,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
    textAlign: 'center',
  },
  fog: {
    borderRadius: radius.sm,
    alignItems: 'center',
    backgroundColor: `color-mix(in srgb, ${colors.muted} 18%, transparent)`,
    color: colors.muted,
    display: 'flex',
    fontSize: fontSize.sm,
    justifyContent: 'center',
    textAlign: 'center',
    minHeight: 100,
  },
  overlay: {
    inset: 0,
    padding: space.xl,
    borderRadius: radius.sm,
    gap: space.md,
    alignItems: 'center',
    backgroundColor: `color-mix(in srgb, ${colors.bg} 82%, transparent)`,
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
    columnGap: space.lg,
    display: 'grid',
    gridTemplateColumns: 'auto auto',
    rowGap: space.xxs,
  },
  infoText: {
    fontSize: fontSize.sm,
    lineHeight: 1.6,
    marginTop: space.xxs,
  },
  curseText: { color: colors.danger },
  keys: {
    margin: 0,
    textAlign: 'center',
  },
});
