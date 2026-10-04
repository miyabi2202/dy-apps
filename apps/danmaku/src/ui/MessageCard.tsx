import * as stylex from '@stylexjs/stylex';
import type { AnimationEvent } from 'react';
import type { Settings } from '../settings';
import { hueFor, type DanmakuMessage } from '../types';
import { Avatar } from './Avatar';

interface Props {
  message: DanmakuMessage;
  settings: Settings;
  /** Play the fly-in. False once it has played, so scrolling back doesn't replay it. */
  animate: boolean;
  onLanded: () => void;
}

/** One message: avatar and name on the first line, the text below, inside a styled border. */
export function MessageCard({ message, settings, animate, onLanded }: Props) {
  const { border, borderWidth: w, radius, opacity } = settings;
  const hue = settings.perUser ? hueFor(message.user.id) : settings.hue;
  const main = `hsl(${hue} 90% 66%)`;
  const second = `hsl(${(hue + 55) % 360} 95% 62%)`;
  const third = `hsl(${(hue + 150) % 360} 90% 64%)`;
  const glow = `hsl(${hue} 90% 60% / 0.55)`;
  const nameColor = `hsl(${hue} 90% ${nameLightness(hue)}%)`;

  const onAnimationEnd = (e: AnimationEvent) => {
    if (e.target === e.currentTarget) onLanded();
  };

  return (
    <article
      onAnimationEnd={onAnimationEnd}
      {...stylex.props(
        styles.card,
        styles.shape(w, radius, opacity / 100),
        border === 'dashed' && styles.dashed(main),
        border === 'neon' &&
          styles.neon(main, `0 0 ${4 + w * 3}px ${glow}, inset 0 0 ${4 + w * 2}px ${glow}`),
        border === 'ribbon' &&
          styles.ribbon(w + 3, main, `hsl(${hue} 90% 66% / 0.35)`, `hsl(${hue} 90% 60% / 0.22)`),
        animate && styles.flyIn,
      )}
    >
      {border === 'gradient' && (
        <span
          aria-hidden
          {...stylex.props(
            styles.frame,
            styles.frameShape(w, radius),
            styles.gradient(main, second),
          )}
        />
      )}
      {border === 'aurora' && (
        <span
          aria-hidden
          {...stylex.props(
            styles.frame,
            styles.frameShape(w, radius),
            styles.aurora(main, second, third),
          )}
        />
      )}
      <header {...stylex.props(styles.header)}>
        <Avatar user={message.user} hue={hue} ring={main} />
        <span
          {...stylex.props(
            styles.name,
            styles.nameColor(nameColor),
            border === 'neon' && styles.nameGlow(glow),
          )}
        >
          {message.user.nickname}
        </span>
      </header>
      <p {...stylex.props(styles.text)}>{message.text}</p>
    </article>
  );
}

// Never larger than the card and never rotated: both would push a wide card's edge out
// in proportion to its width. The fixed -6px overshoot stays inside the row's padding.
/**
 * HSL renders blue–purple hues much darker than others at the same lightness, so their
 * names are hard to read on a dark card. Lift the lightness around hue 255, tapering off
 * by ±55°, so the border keeps its colour and other hues are unchanged.
 */
function nameLightness(hue: number): number {
  return 66 + 14 * Math.max(0, 1 - Math.abs(hue - 255) / 55);
}

const flyIn = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translate(70px, 28px) scale(0.82)' },
  '60%': { opacity: 1, transform: 'translate(-6px, -2px)' },
  '100%': { opacity: 1, transform: 'none' },
});

const auroraShift = stylex.keyframes({
  '0%': { backgroundPosition: '0% 50%' },
  '100%': { backgroundPosition: '100% 50%' },
});

const styles = stylex.create({
  card: {
    borderColor: 'transparent',
    borderStyle: 'solid',
    paddingBlock: '0.5em',
    paddingInline: '0.75em',
    color: '#f8fafc',
    position: 'relative',
  },
  shape: (width: number, radius: number, fill: number) => ({
    borderRadius: radius,
    borderWidth: width,
    backgroundColor: `rgba(12, 14, 24, ${fill})`,
  }),
  dashed: (color: string) => ({
    borderColor: color,
    borderStyle: 'dashed',
  }),
  neon: (color: string, shadow: string) => ({
    borderColor: color,
    boxShadow: shadow,
  }),
  ribbon: (barWidth: number, bar: string, edge: string, wash: string) => ({
    borderColor: edge,
    backgroundImage: `linear-gradient(90deg, ${wash}, transparent 70%)`,
    borderInlineStartColor: bar,
    borderInlineStartWidth: barWidth,
  }),
  flyIn: {
    animationDuration: '2s',
    animationName: flyIn,
    animationTimingFunction: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
    transformOrigin: 'right bottom',
  },
  // A ring drawn over the card's transparent border: a gradient box with its content area
  // masked out, so the gradient doesn't show through a translucent fill.
  frame: {
    maskClip: 'content-box, border-box',
    maskComposite: 'exclude',
    maskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
    pointerEvents: 'none',
    position: 'absolute',
  },
  frameShape: (width: number, radius: number) => ({
    inset: -width,
    padding: width,
    borderRadius: radius,
  }),
  gradient: (from: string, to: string) => ({
    backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
  }),
  // The gradient repeats once across a 200% wide image, so sliding it by half loops seamlessly.
  aurora: (a: string, b: string, c: string) => ({
    animationDuration: '3s',
    animationIterationCount: 'infinite',
    animationName: auroraShift,
    animationTimingFunction: 'linear',
    backgroundImage: `linear-gradient(90deg, ${a}, ${b}, ${c}, ${a}, ${b}, ${c}, ${a})`,
    backgroundSize: '200% 100%',
  }),
  header: {
    gap: '0.5em',
    alignItems: 'center',
    display: 'flex',
    fontSize: '0.82em',
    minWidth: 0,
  },
  name: {
    overflow: 'hidden',
    fontWeight: 700,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameColor: (color: string) => ({ color }),
  nameGlow: (glow: string) => ({ textShadow: `0 0 8px ${glow}` }),
  text: {
    lineHeight: 1.45,
    overflowWrap: 'anywhere',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
    marginBottom: 0,
    marginTop: '0.3em',
  },
});
