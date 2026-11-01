import type { RoomAccount } from '@dy-apps/room-feed-protocol';

/** The part of webcast/user/me/'s answer we read: the page asks it as it loads. */
export interface UserMeAnswer {
  /** 0 with the account; 20003 (`User doesn't login`) when Douyin doesn't take the login. */
  status_code?: number;
  data?: { id_str?: string; nickname?: string; display_id?: string };
}

/** The account the page is logged in as, or `loggedOut` when Douyin says it isn't logged in. */
export type Account = RoomAccount | 'loggedOut';

/** Douyin's status code for a request without a login it takes. */
const NOT_LOGGED_IN = 20003;

/** Who webcast/user/me/ says is logged in; null for an answer that says neither. */
export function readUserMe(body: UserMeAnswer): Account | null {
  if (body.status_code === NOT_LOGGED_IN) return 'loggedOut';
  const uid = body.data?.id_str;
  if (body.status_code !== 0 || !uid) return null;
  return { uid, nickname: body.data?.nickname ?? '', displayId: body.data?.display_id ?? '' };
}

export function isUserMe(url: string): boolean {
  return url.includes('/webcast/user/me/');
}
