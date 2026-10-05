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

/** A chat message, or a gift (whose `text` is empty). */
export interface DanmakuMessage {
  id: string;
  user: DanmakuUser;
  text: string;
  gift?: DanmakuGift;
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
