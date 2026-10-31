import type { Change } from './change';
import type { Entry } from './entry';

/** Which file: the room's memory.md, or one person's note.md. */
export type Target = { scope: 'room' } | { scope: 'note'; userId: string };

/** Who makes a change: Claude answering someone (`tool`, with who asked), or `pnpm remember` (`chat`). */
export type Writer = { by: 'tool'; userId?: string; admin: boolean } | { by: 'chat' };

/** What the policy needs to know about the room. */
export interface RoomFacts {
  /** A 私密 room, whose viewers can't be told apart. */
  isPrivate: boolean;
  streamerId: string | undefined;
}

/**
 * Why `writer` may not make `change` to `target` as it is now (`entries`), in words for Claude, or
 * nothing when it may. The room's memory is for the streamer and admins; a note is its person's
 * own, and not a 私密 room's viewers', who can't be told apart.
 */
export function refusal(
  target: Target,
  _change: Change,
  _entries: readonly Entry[],
  writer: Writer,
  { isPrivate, streamerId }: RoomFacts,
): string | undefined {
  if (writer.by === 'chat') return undefined;
  if (target.scope === 'room') {
    return writer.admin ? undefined : '直播间的记忆只有主播和机器人管理员能改';
  }
  if (!writer.userId) return '不知道你是谁，记不了';
  if (writer.userId !== target.userId) return '只能改问你的这个人自己的';
  if (isPrivate && target.userId !== streamerId) {
    return '私密直播间里分不清谁是谁，不给观众单独记东西';
  }
  return undefined;
}
