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

const ONLY_EXTEND = '这条是主播或管理员写的，只能在后面补充，不能改写或删掉';

/** Whether `content` keeps all of `old`, bar the punctuation or closing bracket it ends with. */
function keeps(old: string, content: string): boolean {
  const stem = old.trim().replace(/[\s。．.，,；;、！!？?）)】」』"”]+$/u, '');
  return !!stem && content.includes(stem);
}

/**
 * Why what `pnpm remember` read out of the chat may not make `change` to the room's memory, or
 * nothing when it may. What it writes is only as good as the chat, which anyone can fill with
 * lies: so it may add, and add to what the streamer or an admin wrote (a replace that keeps the
 * old text), but only rewrite or remove what it wrote itself.
 */
function chatRefusal(change: Change, entries: readonly Entry[]): string | undefined {
  if (change.action === 'add') return undefined;
  const old = change.old.trim();
  const found = entries.filter((entry) => old && entry.text.includes(old));
  // Not found, or in several places: the change itself says why it can't be made.
  if (found.length !== 1 || found[0]!.by === 'chat') return undefined;
  if (change.action === 'replace' && keeps(old, change.content)) return undefined;
  return ONLY_EXTEND;
}

/**
 * Why `writer` may not make `change` to `target` as it is now (`entries`), in words for Claude, or
 * nothing when it may. The room's memory is for the streamer and admins; a note is its person's
 * own, and not a 私密 room's viewers', who can't be told apart.
 */
export function refusal(
  target: Target,
  change: Change,
  entries: readonly Entry[],
  writer: Writer,
  { isPrivate, streamerId }: RoomFacts,
): string | undefined {
  if (writer.by === 'chat') {
    return target.scope === 'room' ? chatRefusal(change, entries) : undefined;
  }
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
