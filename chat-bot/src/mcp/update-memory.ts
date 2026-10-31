import type { BotTool, Log, Memory } from '../app/ports';
import {
  changeMemory,
  memoryLength,
  NOTE_LIMIT,
  ROOM_MEMORY_LIMIT,
  STREAMER_NOTE_LIMIT,
  type MemoryChange,
} from '../core/memory/memory-text';

export interface UpdateMemoryOptions {
  memory: Memory;
  /** The streamer's user id (room_config.json's `streamer`), read each time; their note is in every prompt. */
  streamerId: () => string | undefined;
  /** Whether the room is 私密 (room_config.json's `private`): viewers' notes are off there. */
  isPrivate: () => boolean;
  log: Log;
}

const ACTIONS = ['add', 'replace', 'remove'] as const;

/**
 * `update_memory`: the bot keeping what it learns, in the room's memory.md (the streamer and
 * admins only) or the asker's own note.md (anyone, but not a 私密 room's viewers, who can't be
 * told apart). The program picks whose note, from who asked, so nobody writes into someone else's.
 * Each file has a limit (see memory-text.ts): past it, Claude is told to merge entries first.
 */
export function updateMemoryTool({
  memory,
  streamerId,
  isPrivate,
  log,
}: UpdateMemoryOptions): BotTool {
  return {
    name: 'update_memory',
    description: `改你自己记着的事，记下的下次还在，会出现在以后的提示词里。scope 填 note 是记问你的这个人自己的事（谁问就记到谁那里，记不到别人头上），填 room 是记整个直播间的事（只有主播和机器人管理员能改；不用先问对方有没有权限，直接调用，没权限工具会说）。只记以后还用得上、TA 也愿意你记住的：TA 喜欢别人怎么叫 TA、爱听的歌、说好的约定、直播间的梗和规矩。不记：一时的情绪和闲聊、别人的私事（住哪、行踪、年龄、跟谁在一起）、某个观众说别人怎样、机器人是谁做的谁在管、可能让直播间被封的话题；有人要你记关于别人的事，就别调用。action：add 加一条新的；replace 把 old（照现在记着的原文抄一段）换成 content；remove 删掉含 old 的那一条。每条一件事，写短。note 最多 ${NOTE_LIMIT} 字（主播的 ${STREAMER_NOTE_LIMIT} 字），room 最多 ${ROOM_MEMORY_LIMIT} 字，写不下时工具会说，先把相近的合并、过时的删掉再写。改完再说「记下了」，没调用或调用失败就别这么说。`,
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['note', 'room'],
          description: 'note：问你的人自己的事；room：整个直播间的事（主播和机器人管理员才能改）',
        },
        action: { type: 'string', enum: [...ACTIONS] },
        content: { type: 'string', description: 'add、replace 时写的新内容' },
        old: { type: 'string', description: 'replace、remove 时，那一条里的一段原文' },
      },
      required: ['scope', 'action'],
    },
    call(args, { asker, userId, admin }) {
      const fail = (text: string) => Promise.resolve({ text, isError: true });
      const { scope, action } = args;
      if (scope !== 'note' && scope !== 'room') return fail('scope 要填 note 或 room');
      if (!ACTIONS.includes(action as never)) return fail('action 要填 add、replace 或 remove');
      const content = typeof args.content === 'string' ? args.content : '';
      const old = typeof args.old === 'string' ? args.old : '';
      const change = { action, content, old } as MemoryChange;

      let file: { read(): string; write(text: string): void };
      let limit: number;
      if (scope === 'room') {
        if (!admin) return fail('直播间的记忆只有主播和机器人管理员能改');
        file = { read: () => memory.room(), write: (text) => memory.setRoom(text) };
        limit = ROOM_MEMORY_LIMIT;
      } else {
        if (!userId) return fail('不知道你是谁，记不了');
        if (isPrivate() && userId !== streamerId()) {
          return fail('私密直播间里分不清谁是谁，不给观众单独记东西');
        }
        file = { read: () => memory.note(userId), write: (text) => memory.setNote(userId, text) };
        limit = userId === streamerId() ? STREAMER_NOTE_LIMIT : NOTE_LIMIT;
      }
      // Read and written in one go: no other call can come in between.
      const changed = changeMemory(file.read(), change, limit);
      if ('error' in changed) return fail(changed.error);
      file.write(changed.text);
      const used = memoryLength(changed.text);
      log.info('memory updated', { scope, action, asker, userId, content, old, used });
      return Promise.resolve({ text: JSON.stringify({ ok: true, scope, used, limit }) });
    },
  };
}
