import * as stylex from '@stylexjs/stylex';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { EffectType } from '../core/curses';
import type { PieceType } from '../core/types';
import { shapeOf } from '../core/pieces';
import { drawMiniPiece } from '../render/board';

/**
 * A small piece acting out a curse during its cutscene, so it reads without reading. A curse
 * with a cutscene but no demo shows its rules text instead.
 */
export const CUTSCENE_DEMOS: Partial<Record<EffectType, () => React.ReactElement>> = {
  noRotate: NoRotateDemo,
  spin: SpinDemo,
  slip: SlipDemo,
  mirror: MirrorDemo,
  twin: TwinDemo,
  giant: GiantDemo,
  drunk: DrunkDemo,
  lag: LagDemo,
};

/** Starts to turn, springs back, shudders. */
const triesToTurn = stylex.keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '20%': { transform: 'rotate(28deg)' },
  '32%': { transform: 'rotate(-6deg)' },
  '40%': { transform: 'rotate(0deg) translateX(0)' },
  '46%': { transform: 'translateX(-3px)' },
  '52%': { transform: 'translateX(3px)' },
  '58%': { transform: 'translateX(-2px)' },
  '64%': { transform: 'translateX(0)' },
  '100%': { transform: 'translateX(0)' },
});

/** The lock lands on the piece and stays. */
const lockShut = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translateY(-14px) scale(1.6)' },
  '60%': { opacity: 1, transform: 'translateY(0) scale(0.9)' },
  '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
});

/** Kuru kuru: round and round, fast. */
const kuruKuru = stylex.keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

/** The kuru kuru~ line bobbing and swaying. */
const sway = stylex.keyframes({
  '0%': { transform: 'translateY(0) rotate(-4deg)' },
  '50%': { transform: 'translateY(-3px) rotate(4deg)' },
  '100%': { transform: 'translateY(0) rotate(-4deg)' },
});

const twinkle = stylex.keyframes({
  '0%': { opacity: 0.2, transform: 'scale(0.6) rotate(0deg)' },
  '50%': { opacity: 1, transform: 'scale(1.1) rotate(45deg)' },
  '100%': { opacity: 0.2, transform: 'scale(0.6) rotate(90deg)' },
});

const breathe = stylex.keyframes({
  '0%': { opacity: 0.55, transform: 'scale(0.9)' },
  '50%': { opacity: 1, transform: 'scale(1.08)' },
  '100%': { opacity: 0.55, transform: 'scale(0.9)' },
});

/** Skids one way, leaning, then the other, as if on ice. */
const skids = stylex.keyframes({
  '0%': { transform: 'translateX(0) skewX(0deg)' },
  '18%': { transform: 'translateX(-16px) skewX(14deg)' },
  '30%': { transform: 'translateX(-16px) skewX(0deg)' },
  '55%': { transform: 'translateX(16px) skewX(-14deg)' },
  '67%': { transform: 'translateX(16px) skewX(0deg)' },
  '85%': { transform: 'translateX(0) skewX(8deg)' },
  '100%': { transform: 'translateX(0) skewX(0deg)' },
});

/** Turns over like a card, so the L comes back facing the other way. */
const flips = stylex.keyframes({
  '0%': { transform: 'perspective(200px) rotateY(0deg)' },
  '35%': { transform: 'perspective(200px) rotateY(180deg)' },
  '65%': { transform: 'perspective(200px) rotateY(180deg)' },
  '100%': { transform: 'perspective(200px) rotateY(360deg)' },
});

/** The left arrow crossing over to the right, and back. */
const crossRight = stylex.keyframes({
  '0%': { transform: 'translateX(0)' },
  '35%': { transform: 'translateX(34px)' },
  '65%': { transform: 'translateX(34px)' },
  '100%': { transform: 'translateX(0)' },
});

const crossLeft = stylex.keyframes({
  '0%': { transform: 'translateX(0)' },
  '35%': { transform: 'translateX(-34px)' },
  '65%': { transform: 'translateX(-34px)' },
  '100%': { transform: 'translateX(0)' },
});

/** The pair falling together; the left one lands first and the right one keeps going. */
const fallsShort = stylex.keyframes({
  '0%': { transform: 'translateY(-14px)' },
  '45%': { transform: 'translateY(6px)' },
  '100%': { transform: 'translateY(6px)' },
});

const fallsFar = stylex.keyframes({
  '0%': { transform: 'translateY(-14px)' },
  '45%': { transform: 'translateY(6px)' },
  '80%': { transform: 'translateY(18px)' },
  '100%': { transform: 'translateY(18px)' },
});

/** A heart beating between the pair. */
const beat = stylex.keyframes({
  '0%': { transform: 'scale(0.8)' },
  '20%': { transform: 'scale(1.25)' },
  '40%': { transform: 'scale(0.9)' },
  '60%': { transform: 'scale(1.1)' },
  '100%': { transform: 'scale(0.8)' },
});

/** Swelling up with a wobble, holding big, then snapping back to start again. */
const swells = stylex.keyframes({
  '0%': { transform: 'scale(0.5)' },
  '30%': { transform: 'scale(1.25)' },
  '40%': { transform: 'scale(0.95)' },
  '50%': { transform: 'scale(1.05)' },
  '90%': { transform: 'scale(1)' },
  '100%': { transform: 'scale(0.5)' },
});

/** Staggering about: leaning, lurching, never quite upright. */
const staggers = stylex.keyframes({
  '0%': { transform: 'translateX(0) rotate(0deg)' },
  '20%': { transform: 'translateX(-10px) rotate(-14deg)' },
  '35%': { transform: 'translateX(-4px) rotate(6deg)' },
  '55%': { transform: 'translateX(12px) rotate(16deg)' },
  '75%': { transform: 'translateX(2px) rotate(-8deg)' },
  '100%': { transform: 'translateX(0) rotate(0deg)' },
});

/** Hic: a little bubble rising and fading. */
const hic = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translateY(4px) scale(0.6)' },
  '20%': { opacity: 1, transform: 'translateY(0) scale(1)' },
  '70%': { opacity: 1, transform: 'translateY(-8px) scale(1)' },
  '100%': { opacity: 0, transform: 'translateY(-14px) scale(1)' },
});

/** The key pressed twice: down, up. */
const pressed = stylex.keyframes({
  '0%': { transform: 'translateY(0)' },
  '8%': { transform: 'translateY(3px)' },
  '16%': { transform: 'translateY(0)' },
  '50%': { transform: 'translateY(0)' },
  '58%': { transform: 'translateY(3px)' },
  '66%': { transform: 'translateY(0)' },
  '100%': { transform: 'translateY(0)' },
});

/** The piece moving only well after each press: the gap is the lag. */
const lagsBehind = stylex.keyframes({
  '0%': { transform: 'translateX(0)' },
  '24%': { transform: 'translateX(0)' },
  '30%': { transform: 'translateX(-14px)' },
  '74%': { transform: 'translateX(-14px)' },
  '80%': { transform: 'translateX(-28px)' },
  '100%': { transform: 'translateX(-28px)' },
});

/** The loading spinner nobody wants to see. */
const loading = stylex.keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

function NoRotateDemo() {
  return (
    <div {...stylex.props(styles.stage)}>
      <DemoPiece style={styles.triesToTurn} />
      <span aria-hidden {...stylex.props(styles.badge, styles.lockShut)}>
        🔒
      </span>
    </div>
  );
}

/**
 * 黑塔's chibi gif for 自转's demo, served from `public/assets/`. It spins on its own, so it only
 * bobs; without the file the demo spins the piece instead.
 */
export const HERTA_STICKER_URL = '/assets/hertaa1.gif';

/** 自转 in 黑塔's style: a lilac glow, her sticker (or the piece) spinning kuru kuru, sparkles. */
function SpinDemo() {
  const [sticker, setSticker] = useState(true);
  return (
    <div {...stylex.props(styles.stage, styles.tallStage)}>
      <span aria-hidden {...stylex.props(styles.hertaGlow)} />
      <span aria-hidden {...stylex.props(styles.sparkle, styles.sparkleLeft)}>
        ✦
      </span>
      <span aria-hidden {...stylex.props(styles.sparkle, styles.sparkleRight)}>
        ✦
      </span>
      {sticker ? (
        <img
          src={HERTA_STICKER_URL}
          alt=""
          onError={() => setSticker(false)}
          {...stylex.props(styles.sticker)}
        />
      ) : (
        <DemoPiece style={styles.kuruKuru} />
      )}
      <span aria-hidden {...stylex.props(styles.kuruText)}>
        kuru kuru~
      </span>
    </div>
  );
}

function SlipDemo() {
  return (
    <div {...stylex.props(styles.stage)}>
      <DemoPiece style={styles.skids} />
    </div>
  );
}

function MirrorDemo() {
  return (
    <div {...stylex.props(styles.stage, styles.tallStage)}>
      <DemoPiece type="L" style={styles.flips} />
      <div aria-hidden {...stylex.props(styles.arrows)}>
        <span {...stylex.props(styles.arrow, styles.crossRight)}>←</span>
        <span {...stylex.props(styles.arrow, styles.crossLeft)}>→</span>
      </div>
    </div>
  );
}

function TwinDemo() {
  return (
    <div {...stylex.props(styles.stage, styles.pairStage)}>
      <DemoPiece type="J" style={[styles.half, styles.fallsShort]} />
      <span aria-hidden {...stylex.props(styles.heart)}>
        ♥
      </span>
      <DemoPiece type="L" style={[styles.half, styles.fallsFar]} />
    </div>
  );
}

/** A piece puffing up to twice its size. */
function GiantDemo() {
  return (
    <div {...stylex.props(styles.stage, styles.bigStage)}>
      <DemoPiece type="O" style={[styles.giant, styles.swells]} />
    </div>
  );
}

/** A piece staggering about, hiccuping. */
function DrunkDemo() {
  return (
    <div {...stylex.props(styles.stage)}>
      <DemoPiece style={styles.staggers} />
      <span aria-hidden {...stylex.props(styles.hic)}>
        嗝~
      </span>
    </div>
  );
}

/** ← pressed twice; the piece follows each press only a beat later, beside a loading spinner. */
function LagDemo() {
  return (
    <div {...stylex.props(styles.stage, styles.lagStage)}>
      <span aria-hidden {...stylex.props(styles.key)}>
        ←
      </span>
      <DemoPiece style={styles.lagsBehind} />
      <span aria-hidden {...stylex.props(styles.spinner)} />
    </div>
  );
}

/** A piece (T by default) on a small canvas, moved by `style`. */
function DemoPiece({ type = 'T', style }: { type?: PieceType; style: stylex.StyleXStyles }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMiniPiece(ref.current, shapeOf(type));
  }, [type]);
  return <canvas ref={ref} aria-hidden {...stylex.props(styles.piece, style)} />;
}

const styles = stylex.create({
  stage: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    position: 'relative',
    height: 64,
    width: 64,
  },
  piece: {
    display: 'block',
    height: 56,
    width: 56,
  },
  badge: {
    fontSize: 22,
    position: 'absolute',
    right: -6,
    top: -4,
  },
  triesToTurn: {
    animationDuration: '1.4s',
    animationIterationCount: 'infinite',
    animationName: triesToTurn,
    animationTimingFunction: 'ease-out',
  },
  lockShut: {
    animationDelay: '0.3s',
    animationDuration: '400ms',
    animationFillMode: 'both',
    animationName: lockShut,
    animationTimingFunction: 'ease-out',
  },
  /** 自转's demo in 黑塔's lilac and white (#c9b6f2, #ede6ff, #7c5cc4). */
  kuruKuru: {
    animationDuration: '700ms',
    animationIterationCount: 'infinite',
    animationName: kuruKuru,
    animationTimingFunction: 'linear',
    position: 'relative',
  },
  sticker: {
    animationDuration: '900ms',
    animationIterationCount: 'infinite',
    animationName: sway,
    display: 'block',
    objectFit: 'contain',
    position: 'relative',
    height: 72,
    width: 72,
  },
  hertaGlow: {
    borderRadius: '50%',
    animationDuration: '1.4s',
    animationIterationCount: 'infinite',
    animationName: breathe,
    backgroundImage: `radial-gradient(circle, #ede6ff 0%, #c9b6f2 35%, transparent 70%)`,
    opacity: 0.8,
    position: 'absolute',
    height: 64,
    left: '50%',
    marginLeft: -32,
    top: 0,
    width: 64,
  },
  sparkle: {
    animationDuration: '1.2s',
    animationIterationCount: 'infinite',
    animationName: twinkle,
    color: '#ede6ff',
    fontSize: 12,
    position: 'absolute',
    textShadow: `0 0 6px #c9b6f2`,
  },
  sparkleLeft: { left: -4, top: 6 },
  sparkleRight: { animationDelay: '600ms', right: -4, top: 30 },
  kuruText: {
    animationDuration: '900ms',
    animationIterationCount: 'infinite',
    animationName: sway,
    color: '#c9b6f2',
    fontSize: 13,
    fontStyle: 'italic',
    fontWeight: 800,
    position: 'relative',
    textShadow: `0 0 6px #7c5cc4`,
    whiteSpace: 'nowrap',
  },
  skids: {
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    animationName: skids,
    animationTimingFunction: 'ease-out',
  },
  tallStage: {
    flexDirection: 'column',
    height: 84,
  },
  flips: {
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    animationName: flips,
    animationTimingFunction: 'ease-in-out',
  },
  arrows: {
    display: 'flex',
    justifyContent: 'space-between',
    width: 52,
  },
  arrow: {
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
    fontSize: 16,
    fontWeight: 800,
  },
  pairStage: {
    gap: 2,
    width: 96,
  },
  half: {
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in',
    height: 40,
    width: 40,
  },
  fallsShort: { animationName: fallsShort },
  fallsFar: { animationName: fallsFar },
  heart: {
    animationDuration: '1s',
    animationIterationCount: 'infinite',
    animationName: beat,
    color: '#fb7185',
    fontSize: 14,
    textShadow: '0 0 6px #fb7185',
  },
  bigStage: {
    height: 84,
    width: 84,
  },
  giant: {
    height: 72,
    width: 72,
  },
  swells: {
    animationDuration: '1.8s',
    animationIterationCount: 'infinite',
    animationName: swells,
    animationTimingFunction: 'ease-out',
  },
  staggers: {
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    animationName: staggers,
    animationTimingFunction: 'ease-in-out',
  },
  hic: {
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    animationName: hic,
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: 800,
    position: 'absolute',
    right: -18,
    top: -6,
  },
  lagStage: {
    gap: 6,
    width: 120,
  },
  key: {
    borderColor: '#94a3b8',
    borderRadius: 6,
    borderStyle: 'solid',
    borderWidth: 2,
    placeItems: 'center',
    animationDuration: '2s',
    animationIterationCount: 'infinite',
    animationName: pressed,
    backgroundColor: '#e2e8f0',
    boxShadow: '0 3px 0 #475569',
    color: '#0f172a',
    display: 'grid',
    fontSize: 16,
    fontWeight: 900,
    height: 28,
    width: 28,
  },
  lagsBehind: {
    animationDuration: '2s',
    animationIterationCount: 'infinite',
    animationName: lagsBehind,
    animationTimingFunction: 'ease-out',
    height: 44,
    width: 44,
  },
  spinner: {
    borderColor: '#94a3b8',
    borderRadius: '50%',
    borderStyle: 'solid',
    borderWidth: 3,
    animationDuration: '800ms',
    animationIterationCount: 'infinite',
    animationName: loading,
    animationTimingFunction: 'linear',
    borderTopColor: 'transparent',
    height: 18,
    width: 18,
  },
  crossRight: { animationName: crossRight },
  crossLeft: { animationName: crossLeft },
});
