/** Chat, gift and like messages from a live room, as the message cards show them. */
import type { DyhubChatData, DyhubEvent, DyhubGiftData, DyhubUser } from './dyhub';
import type { ChatPart } from './emoji';

export interface DanmakuUser {
  id: string;
  nickname: string;
  /** Falls back to a generated initial avatar when missing or broken. */
  avatarUrl?: string;
  /** This room's fan club; missing when the user isn't a member. */
  fansClub?: { name: string; level: number };
}

export interface DanmakuGift {
  name: string;
  count: number;
  /** Price of one gift in Douyin diamonds; missing when DyHub doesn't send it. */
  diamonds?: number;
  iconUrl?: string;
}

/** A run of a message's detail line, in its own colour when `color` is set. */
export interface DetailPart {
  text: string;
  /** Any CSS colour; the card's default text colour when missing. */
  color?: string;
}

/** The detail line as plain text, however it was given. */
export function detailText(detail: DanmakuMessage['detail']): string {
  if (detail === undefined) return '';
  return typeof detail === 'string' ? detail : detail.map((part) => part.text).join('');
}

/** A chat message, a gift or a run of likes (the last two have an empty `text`). */
export interface DanmakuMessage {
  id: string;
  user: DanmakuUser;
  text: string;
  gift?: DanmakuGift;
  /** How many likes the user sent, added up until they stopped for a while. */
  likes?: number;
  /** A smaller line under the text or gift, e.g. what a gift did in a game; parts can be coloured. */
  detail?: string | DetailPart[];
  /**
   * The chat as text and images, when Douyin sent rich text (fan-club emotes, @mentions).
   * Shown instead of `text`, which is then the plain fallback.
   */
  parts?: ChatPart[];
  /** The whole message is one big emote image (in `parts`). */
  sticker?: boolean;
  ts: number;
}

/**
 * Appends a message, keeping at most `max`. A gift with the id of one already on the wall
 * is more of the same combo: its count adds to that card, which moves to the bottom, so a
 * combo of hundreds stays one card.
 */
export function addMessage(
  messages: readonly DanmakuMessage[],
  message: DanmakuMessage,
  max: number,
): readonly DanmakuMessage[] {
  let next: DanmakuMessage[];
  const i = message.gift ? messages.findIndex((m) => m.id === message.id) : -1;
  const old = messages[i]?.gift;
  if (old && message.gift) {
    const merged = { ...message, gift: { ...message.gift, count: old.count + message.gift.count } };
    next = [...messages.slice(0, i), ...messages.slice(i + 1), merged];
  } else {
    next = [...messages, message];
  }
  return next.length > max ? next.slice(-max) : next;
}

/** Stable 0–359 hue for a user, so each viewer keeps one colour. */
export function hueFor(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0;
  }
  // Golden-angle steps keep near-identical ids (user-1, user-2) far apart on the wheel.
  return Math.round(Math.abs(h) * 137.508) % 360;
}

/** One card for a user's run of likes, from their last like event and the run's total. */
export function likeMessage(last: DyhubEvent, total: number): DanmakuMessage | null {
  if (!last.user) return null;
  return { id: `like-${last.id}`, user: userFrom(last.user), text: '', likes: total, ts: last.ts };
}

/**
 * A DyHub chat or gift event as a wall message; null for other events and empty chats.
 * `newGifts` is how many gifts the event adds (from GiftCounter); 0 drops it as a repeat.
 */
export function messageFromEvent(ev: DyhubEvent, newGifts: number): DanmakuMessage | null {
  if (!ev.user) return null;
  const user = userFrom(ev.user);
  if (ev.type === 'gift') {
    if (newGifts <= 0) return null;
    const gift = ev.data as unknown as DyhubGiftData;
    return {
      // One id per combo, so later messages of the combo add to the same card.
      id: gift.groupId ? `gift-${user.id}-${gift.giftId}-${gift.groupId}` : ev.id,
      user,
      text: '',
      gift: {
        name: gift.giftName || '礼物',
        count: newGifts,
        diamonds: gift.diamondCount,
        iconUrl: gift.giftIcon,
      },
      ts: ev.ts,
    };
  }
  if (ev.type !== 'chat') return null;
  const data = ev.data as Partial<DyhubChatData> | undefined;
  const text = typeof data?.content === 'string' ? data.content : '';
  const parts = partsFrom(data?.parts);
  if (!text.trim() && !parts) return null;
  return {
    id: ev.id,
    user,
    text,
    ...(parts && { parts }),
    ...(data?.sticker && parts && { sticker: true }),
    ts: ev.ts,
  };
}

/** DyHub's rich-text parts as text and images; mentions read as text. Undefined if none. */
function partsFrom(raw: unknown): ChatPart[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parts: ChatPart[] = [];
  for (const part of raw as Record<string, unknown>[]) {
    if (part?.type === 'emote' && typeof part.url === 'string' && /^https?:/.test(part.url)) {
      parts.push({
        emoji: typeof part.name === 'string' && part.name ? part.name : '[表情]',
        url: part.url,
      });
    } else if (typeof part?.text === 'string' && part.text) {
      parts.push({ text: part.text });
    }
  }
  return parts.length ? parts : undefined;
}

function userFrom({ id, nickname, avatar, fansClub }: DyhubUser): DanmakuUser {
  return {
    id,
    nickname,
    avatarUrl: avatar,
    fansClub: fansClub && { name: fansClub.name, level: fansClub.level },
  };
}
