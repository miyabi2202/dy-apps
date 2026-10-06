import { hueFor, type DanmakuGift, type DanmakuMessage } from '@dy-apps/services';
import * as stylex from '@stylexjs/stylex';
import { useState, type AnimationEvent } from 'react';
import { Avatar } from './avatar';
import type { CardStyle } from './card-style';
import { ChatText } from './chat-text';
import { testIds } from './messages';

interface Props {
  message: DanmakuMessage;
  settings: CardStyle;
  /** Play the fly-in. False once it has played, so scrolling back doesn't replay it. */
  animate: boolean;
  onLanded: () => void;
}

/**
 * One message: a tall avatar on the left, the name above the text beside it, inside a styled
 * border. A `detail` goes on a smaller line underneath.
 */
export function MessageCard({ message, settings, animate, onLanded }: Props) {
  const { border, borderWidth: w, radius, opacity } = settings;
  const hue = settings.perUser ? hueFor(message.user.id) : settings.hue;
  const main = `hsl(${hue} 90% 66%)`;
  const second = `hsl(${(hue + 55) % 360} 95% 62%)`;
  const third = `hsl(${(hue + 150) % 360} 90% 64%)`;
  const glow = `hsl(${hue} 90% 60% / 0.55)`;
  const nameColor = `hsl(${hue} 90% ${nameLightness(hue)}%)`;

  const { fansClub } = message.user;

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
      {/* Grid: the avatar spans both rows; name and fan-club badge, then the message, beside it. */}
      <div {...stylex.props(styles.avatar)}>
        <Avatar user={message.user} hue={hue} ring={main} />
      </div>
      <div {...stylex.props(styles.header)}>
        <span
          {...stylex.props(
            styles.name,
            styles.nameColor(nameColor),
            border === 'neon' && styles.nameGlow(glow),
          )}
        >
          {message.user.nickname}
        </span>
        {fansClub && <FansClubBadge level={fansClub.level} name={fansClub.name} />}
      </div>
      {message.gift ? (
        <GiftLine gift={message.gift} />
      ) : message.likes ? (
        <p data-testid={testIds.likes} {...stylex.props(styles.text, styles.gift)}>
          <span {...stylex.props(styles.giftVerb)}>点赞</span>
          <span aria-hidden>❤️</span>
          <span {...stylex.props(styles.giftCount, styles.likeCount)}>×{message.likes}</span>
        </p>
      ) : (
        <p {...stylex.props(styles.text)}>
          <ChatText text={message.text} parts={message.parts} sticker={message.sticker} />
        </p>
      )}
      {message.detail && (
        <p data-testid={testIds.detail} {...stylex.props(styles.detail)}>
          {message.detail}
        </p>
      )}
    </article>
  );
}

/**
 * 送出 <icon> <name> ×<count>（<total>钻）. The count, and so the total, grows as a combo
 * goes on.
 */
function GiftLine({ gift }: { gift: DanmakuGift }) {
  const [iconBroken, setIconBroken] = useState(false);
  return (
    <p data-testid={testIds.gift} {...stylex.props(styles.text, styles.gift)}>
      <span {...stylex.props(styles.giftVerb)}>送出</span>
      {gift.iconUrl && !iconBroken ? (
        <img
          alt=""
          src={gift.iconUrl}
          onError={() => setIconBroken(true)}
          {...stylex.props(styles.giftIcon)}
        />
      ) : (
        <span aria-hidden>🎁</span>
      )}
      <span {...stylex.props(styles.giftName)}>{gift.name}</span>
      <span {...stylex.props(styles.giftCount)}>×{gift.count}</span>
      {gift.diamonds ? (
        <span data-testid={testIds.giftDiamonds} {...stylex.props(styles.giftVerb)}>
          （{(gift.diamonds * gift.count).toLocaleString('zh-CN')}钻）
        </span>
      ) : null}
    </p>
  );
}

/** Fan-club level as a small heart pill, coloured by tier like Douyin's badges. */
function FansClubBadge({ level, name }: { level: number; name: string }) {
  return (
    <span
      title={`${name} 粉丝团 ${level} 级`}
      data-testid={testIds.fansClubLevel}
      {...stylex.props(styles.badge, styles.badgeTier(fansClubTier(level)))}
    >
      ♥{level}
    </span>
  );
}

const FANS_CLUB_TIERS = [
  { from: 1, colors: ['#5eead4', '#14b8a6'] },
  { from: 6, colors: ['#7dd3fc', '#3b82f6'] },
  { from: 11, colors: ['#c4b5fd', '#8b5cf6'] },
  { from: 16, colors: ['#fda4af', '#f43f5e'] },
  { from: 21, colors: ['#fde68a', '#f59e0b'] },
] as const;

function fansClubTier(level: number): string {
  let [from, to]: readonly string[] = FANS_CLUB_TIERS[0].colors;
  for (const t of FANS_CLUB_TIERS) if (level >= t.from) [from, to] = t.colors;
  return `linear-gradient(135deg, ${from}, ${to})`;
}

/**
 * HSL renders blue–purple hues much darker than others at the same lightness, so their
 * names are hard to read on a dark card. Lift the lightness around hue 255, tapering off
 * by ±55°, so the border keeps its colour and other hues are unchanged.
 */
function nameLightness(hue: number): number {
  return 66 + 14 * Math.max(0, 1 - Math.abs(hue - 255) / 55);
}

// Never larger than the card and never rotated: both would push a wide card's edge out
// in proportion to its width. The fixed -6px overshoot stays inside the row's padding.
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
    gridTemplateAreas: '"avatar name" "avatar text" ". detail"',
    paddingBlock: '0.5em',
    paddingInline: '0.75em',
    color: '#f8fafc',
    columnGap: '0.6em',
    display: 'grid',
    // Fixed to the avatar's width (1.9em at 1.3em).
    gridTemplateColumns: '2.47em minmax(0, 1fr)',
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
  // Tall enough to span the name and the message's first line.
  avatar: {
    gridArea: 'avatar',
    alignSelf: 'center',
    display: 'flex',
    fontSize: '1.3em',
    justifyContent: 'center',
  },
  header: {
    gridArea: 'name',
    gap: '0.4em',
    alignItems: 'center',
    display: 'flex',
    minWidth: 0,
  },
  badge: {
    borderRadius: 999,
    paddingInline: '0.45em',
    color: '#fff',
    flexShrink: 0,
    fontSize: '0.62em',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 800,
    lineHeight: 1.5,
    textShadow: '0 1px 1px rgba(0, 0, 0, 0.35)',
    whiteSpace: 'nowrap',
  },
  badgeTier: (gradient: string) => ({ backgroundImage: gradient }),
  name: {
    overflow: 'hidden',
    fontSize: '0.82em',
    fontWeight: 700,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameColor: (color: string) => ({ color }),
  nameGlow: (glow: string) => ({ textShadow: `0 0 8px ${glow}` }),
  gift: {
    alignItems: 'center',
    columnGap: '0.3em',
    display: 'flex',
    flexWrap: 'wrap',
  },
  giftVerb: {
    opacity: 0.8,
  },
  giftIcon: {
    flexShrink: 0,
    objectFit: 'contain',
    height: '1.6em',
    width: '1.6em',
  },
  giftName: {
    fontWeight: 700,
  },
  // Gold and a touch larger, in fixed-width digits so a climbing combo doesn't jitter.
  giftCount: {
    color: '#fcd34d',
    fontSize: '1.15em',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 800,
  },
  likeCount: {
    color: '#f9a8d4',
  },
  text: {
    gridArea: 'text',
    lineHeight: 1.45,
    overflowWrap: 'anywhere',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
    marginBottom: 0,
    marginTop: '0.3em',
  },
  detail: {
    gridArea: 'detail',
    fontSize: '0.8em',
    lineHeight: 1.4,
    opacity: 0.85,
    overflowWrap: 'anywhere',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
    marginBottom: 0,
    marginTop: '0.25em',
  },
});
