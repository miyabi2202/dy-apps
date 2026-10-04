export interface DanmakuUser {
  id: string;
  nickname: string;
  /** Falls back to a generated initial avatar when missing or broken. */
  avatarUrl?: string;
  /** This room's fan club; missing when the user isn't a member. */
  fansClub?: { name: string; level: number };
}

export interface DanmakuMessage {
  id: string;
  user: DanmakuUser;
  text: string;
  ts: number;
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
