/** The id Douyin gives every viewer in a 私密 room, where viewers hide who they are. */
export const HIDDEN_ID = '111111';

/** The part of a viewer, as the room's events give it, that tells them apart. */
export interface Viewer {
  id: string;
  nickname: string;
  /** Their wealth level, which Douyin still shows in a 私密 room. */
  payLevel?: number;
}

/**
 * The user id the bot keeps a viewer under. In a 私密 room (`hidden`), viewers all share HIDDEN_ID
 * and the same default avatar, and show only their nickname's first character (`苦***`), so
 * they're told apart by that and their wealth level, taken not to change while the bot runs:
 * `111111-苦***-31`.
 */
export function viewerIdOf({ id, nickname, payLevel }: Viewer, hidden: boolean): string {
  if (!hidden || id !== HIDDEN_ID) return id;
  return `${HIDDEN_ID}-${nickname}-${payLevel ?? 0}`;
}

/** Whether `userId` is a 私密 room's viewer, as viewerIdOf gives it. */
export function isHiddenViewer(userId: string): boolean {
  return userId.startsWith(`${HIDDEN_ID}-`);
}

/** Whether `userId` is a Douyin user id as it comes (digits), not a 私密 viewer's made-up one. */
export function isDouyinUserId(userId: string): boolean {
  return /^\d+$/.test(userId);
}
