import { fonts, radius } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef } from 'react';
import type { CutInRequest } from '../removal/board';
import { testIds } from '../messages';
import { bakeSprite } from '../render/bake';

interface Props {
  request: CutInRequest;
  /** The remover's name to show, and its line. */
  title: string;
  line: string;
  /** Called once it is gone. */
  onDone: () => void;
}

/** How long the banner is up, from slamming in to gone, ms. Every animation below runs this long. */
export const CUT_IN_MS = 1100;

/**
 * The anime cut-in: a flash, rays turning behind a diagonal banner that slashes in from the
 * right with the remover's portrait, name and line. It lasts `CUT_IN_MS` and then calls
 * `onDone`. It plays once from CSS animations, so nothing in it changes per frame and React
 * renders it only when it comes and goes. Everything is sized from the stage's width, so it
 * looks the same on any size of canvas.
 */
export function CutIn({ request, title, line, onDone }: Props) {
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const timer = window.setTimeout(() => doneRef.current(), CUT_IN_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div data-testid={testIds.cutIn} role="status" {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.dim)} />
      <div {...stylex.props(styles.rays)} />
      <div {...stylex.props(styles.raysFine)} />
      <div {...stylex.props(styles.band)}>
        <div {...stylex.props(styles.shadow)} />
        <div {...stylex.props(styles.main, styles.accent(request.color))}>
          <div {...stylex.props(styles.sheen)} />
          <div {...stylex.props(styles.dots)} />
          <div {...stylex.props(styles.edge, styles.edgeTop)} />
          <div {...stylex.props(styles.edge, styles.edgeBottom)} />
          <div {...stylex.props(styles.streak)} />
        </div>
        <div {...stylex.props(styles.content)}>
          <Portrait request={request} title={title} />
          <div {...stylex.props(styles.words)}>
            <span {...stylex.props(styles.title)}>{title}</span>
            <span {...stylex.props(styles.line)}>{line}</span>
          </div>
        </div>
      </div>
      <div {...stylex.props(styles.flash)} />
    </div>
  );
}

/** The remover's picture in a ring, or, if it gave none, the first letter of its name. */
function Portrait({ request, title }: { request: CutInRequest; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { portrait } = request;
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const baked = portrait ? bakeSprite(portrait, 2) : null;
    if (!canvas || !ctx || !baked) return;
    const fit = Math.min(canvas.width / baked.width, canvas.height / baked.height);
    const w = baked.width * fit;
    const h = baked.height * fit;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baked, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }, [portrait]);
  return (
    <div {...stylex.props(styles.portrait, styles.ring(request.color))}>
      {portrait ? (
        <canvas ref={canvasRef} width={192} height={192} {...stylex.props(styles.picture)} />
      ) : (
        <span {...stylex.props(styles.initial)}>{title.slice(0, 1)}</span>
      )}
    </div>
  );
}

const DARK = '#14122b';
const YELLOW = '#ffe94a';
const REDUCED = '@media (prefers-reduced-motion: reduce)';

// Each runs the whole `CUT_IN_MS` (1% is 11 ms), so a piece's in and out are percentages.
const slashIn = stylex.keyframes({
  '0%': { animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', transform: 'translateX(115%)' },
  '12%': { transform: 'translateX(0)' },
  '80%': { animationTimingFunction: 'cubic-bezier(0.5, 0, 1, 0.6)', transform: 'translateX(0)' },
  '100%': { transform: 'translateX(-60%)' },
});
const slashShadow = stylex.keyframes({
  '0%': { transform: 'translateX(130%)' },
  '5%': { animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', transform: 'translateX(130%)' },
  '17%': { transform: 'translateX(0)' },
  '80%': { animationTimingFunction: 'cubic-bezier(0.5, 0, 1, 0.6)', transform: 'translateX(0)' },
  '100%': { transform: 'translateX(-70%)' },
});
const popIn = stylex.keyframes({
  '0%, 5%': { opacity: 0, transform: 'scale(2.2) rotate(-18deg)' },
  '12%': { opacity: 1, transform: 'scale(0.85) rotate(4deg)' },
  '19%': { transform: 'scale(1.08) rotate(-2deg)' },
  '25%, 100%': { opacity: 1, transform: 'scale(1) rotate(0deg)' },
});
const wordsIn = stylex.keyframes({
  '0%, 8%': { opacity: 0, transform: 'translateX(-14cqw) scale(1.25)' },
  '20%': { opacity: 1, transform: 'translateX(0) scale(1)' },
  '100%': { opacity: 1, transform: 'translateX(0) scale(1)' },
});
const flash = stylex.keyframes({
  '0%': { opacity: 0.95 },
  '12%': { opacity: 0 },
  '100%': { opacity: 0 },
});
const dim = stylex.keyframes({
  '0%': { opacity: 0 },
  '10%': { opacity: 1 },
  '80%': { opacity: 1 },
  '100%': { opacity: 0 },
});
const spin = stylex.keyframes({
  '0%': { opacity: 0, transform: 'rotate(0deg) scale(0.6)' },
  '10%': { opacity: 1 },
  '80%': { opacity: 1 },
  '100%': { opacity: 0, transform: 'rotate(75deg) scale(1.15)' },
});
const spinBack = stylex.keyframes({
  '0%': { opacity: 0, transform: 'rotate(0deg) scale(0.5)' },
  '10%': { opacity: 1 },
  '80%': { opacity: 1 },
  '100%': { opacity: 0, transform: 'rotate(-110deg) scale(1.25)' },
});
const sweep = stylex.keyframes({
  '0%, 14%': { transform: 'translateX(-60cqw) skewX(-24deg)' },
  '40%, 100%': { transform: 'translateX(130cqw) skewX(-24deg)' },
});
const fade = stylex.keyframes({
  '0%': { opacity: 0 },
  '12%': { opacity: 1 },
  '80%': { opacity: 1 },
  '100%': { opacity: 0 },
});

const styles = stylex.create({
  // The overlay covers the canvas and takes no clicks; `cqw` below is a hundredth of its width.
  root: {
    inset: 0,
    borderRadius: radius.md,
    overflow: 'hidden',
    containerType: 'inline-size',
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: 5,
  },
  dim: {
    inset: 0,
    animationDuration: `${CUT_IN_MS}ms`,
    animationFillMode: 'both',
    animationName: dim,
    backgroundImage:
      'radial-gradient(ellipse at center, rgba(8, 6, 28, 0.2) 25%, rgba(8, 6, 28, 0.8))',
    position: 'absolute',
  },
  // Coarse rays turning one way and fine ones the other, thinning out to the middle.
  rays: {
    animationDuration: `${CUT_IN_MS}ms`,
    animationFillMode: 'both',
    animationName: { [REDUCED]: fade, default: spin },
    animationTimingFunction: 'cubic-bezier(0.2, 0.6, 0.3, 1)',
    backgroundImage:
      'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255, 255, 255, 0.5) 0deg 2.5deg, transparent 2.5deg 11deg)',
    maskImage: 'radial-gradient(circle at center, transparent 18%, #000 62%)',
    mixBlendMode: 'screen',
    position: 'absolute',
    height: '260cqw',
    left: '-80cqw',
    top: 'calc(50% - 130cqw)',
    width: '260cqw',
  },
  raysFine: {
    animationDuration: `${CUT_IN_MS}ms`,
    animationFillMode: 'both',
    animationName: { [REDUCED]: fade, default: spinBack },
    animationTimingFunction: 'cubic-bezier(0.2, 0.6, 0.3, 1)',
    backgroundImage:
      'repeating-conic-gradient(from 7deg at 50% 50%, rgba(255, 233, 74, 0.35) 0deg 1deg, transparent 1deg 5deg)',
    maskImage: 'radial-gradient(circle at center, transparent 30%, #000 75%)',
    mixBlendMode: 'screen',
    position: 'absolute',
    height: '260cqw',
    left: '-80cqw',
    top: 'calc(50% - 130cqw)',
    width: '260cqw',
  },
  // The slashed band, tilted; its pieces share a box so they slide as one.
  band: {
    position: 'absolute',
    transform: 'rotate(-9deg)',
    height: '30cqw',
    left: '-8cqw',
    right: '-8cqw',
    top: 'calc(50% - 15cqw)',
  },
  shadow: {
    inset: 0,
    animationDuration: `${CUT_IN_MS}ms`,
    animationFillMode: 'both',
    animationName: slashShadow,
    backgroundColor: DARK,
    clipPath: 'polygon(0 14%, 100% 0, 100% 86%, 0 100%)',
    opacity: 0.85,
    position: 'absolute',
    transform: 'translateY(2.4cqw)',
  },
  main: {
    inset: 0,
    overflow: 'hidden',
    animationDuration: `${CUT_IN_MS}ms`,
    animationFillMode: 'both',
    animationName: slashIn,
    clipPath: 'polygon(0 8%, 100% 0, 100% 92%, 0 100%)',
    position: 'absolute',
  },
  accent: (color: string) => ({ backgroundColor: color }),
  // Light from the top and dark from the bottom over the accent colour.
  sheen: {
    inset: 0,
    backgroundImage:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0) 48%, rgba(0, 0, 0, 0.35))',
    position: 'absolute',
  },
  dots: {
    inset: 0,
    backgroundImage: 'radial-gradient(rgba(0, 0, 0, 0.22) 22%, transparent 24%)',
    backgroundSize: '2.2cqw 2.2cqw',
    maskImage: 'linear-gradient(90deg, transparent 20%, #000)',
    position: 'absolute',
  },
  edge: {
    backgroundColor: '#fff',
    boxShadow: '0 0 1.6cqw rgba(255, 255, 255, 0.9)',
    position: 'absolute',
    height: '1.1cqw',
    left: 0,
    right: 0,
  },
  edgeTop: { top: '6%' },
  edgeBottom: { bottom: '6%' },
  streak: {
    animationDuration: `${CUT_IN_MS}ms`,
    animationFillMode: 'both',
    animationName: sweep,
    animationTimingFunction: 'ease-out',
    backgroundImage:
      'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.75) 50%, transparent)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    top: 0,
    width: '18cqw',
  },
  content: {
    inset: 0,
    gap: '3cqw',
    alignItems: 'center',
    display: 'flex',
    position: 'absolute',
    paddingLeft: '14cqw',
    paddingRight: '8cqw',
  },
  portrait: {
    borderRadius: '50%',
    overflow: 'hidden',
    alignItems: 'center',
    animationDuration: `${CUT_IN_MS}ms`,
    animationFillMode: 'both',
    animationName: popIn,
    animationTimingFunction: 'ease-out',
    backgroundImage: 'radial-gradient(circle at 35% 30%, #fff, #e0e7ff 55%, #a5b4fc)',
    display: 'flex',
    flexShrink: 0,
    justifyContent: 'center',
    height: '25cqw',
    marginTop: '-7cqw',
    width: '25cqw',
  },
  ring: (color: string) => ({
    borderColor: '#fff',
    borderStyle: 'solid',
    borderWidth: '1.1cqw',
    boxShadow: `0 0 0 1cqw ${color}, 0 1.6cqw 3cqw rgba(0, 0, 0, 0.55)`,
  }),
  picture: {
    height: '100%',
    width: '100%',
  },
  initial: {
    color: DARK,
    fontFamily: fonts.body,
    fontSize: '14cqw',
    fontWeight: 900,
  },
  words: {
    gap: '0.6cqw',
    animationDuration: `${CUT_IN_MS}ms`,
    animationFillMode: 'both',
    animationName: wordsIn,
    animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  title: {
    color: '#fff',
    fontFamily: fonts.body,
    fontSize: '9.5cqw',
    fontStyle: 'italic',
    fontWeight: 900,
    letterSpacing: '0.3cqw',
    lineHeight: 1,
    textShadow: `0.5cqw 0.5cqw 0 ${DARK}, 0 0 2cqw rgba(0, 0, 0, 0.5)`,
    whiteSpace: 'nowrap',
  },
  // A dark tag under the name, so the line reads on any accent colour.
  line: {
    borderRadius: '0.8cqw',
    paddingBlock: '0.5cqw',
    paddingInline: '2cqw',
    alignSelf: 'flex-start',
    backgroundColor: DARK,
    color: YELLOW,
    fontFamily: fonts.body,
    fontSize: '5cqw',
    fontStyle: 'italic',
    fontWeight: 800,
    lineHeight: 1.2,
    transform: 'skewX(-10deg)',
    whiteSpace: 'nowrap',
    marginTop: '0.8cqw',
  },

  flash: {
    inset: 0,
    animationDuration: `${CUT_IN_MS}ms`,
    animationFillMode: 'both',
    animationName: { [REDUCED]: 'none', default: flash },
    backgroundColor: '#fff',
    position: 'absolute',
  },
});
