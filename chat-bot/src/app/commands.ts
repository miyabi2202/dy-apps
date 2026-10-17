import type { Billing } from './billing';
import type { GiftThanker } from './gift-thanker';
import type { RoomState } from './room-state';
import type { Talker } from './talker';

/**
 * What a command came to: `reply` is what the bot says back, nothing when empty (the command
 * spoke for itself). A failed one is refunded.
 */
export interface CommandResult {
  ok: boolean;
  reply: string;
}

/**
 * Something viewers can tell the bot to do, as `@机器人/<name> <args>`: either `run` it, or ask
 * Claude with its own `prompt` (the args as the question), answered like a mention.
 */
export type Command = {
  name: string;
  /** Only admins can run it; anyone else's call is ignored. */
  adminOnly: boolean;
  /** Diamonds it costs a viewer, taken before it runs; a mention's price when not set. Admins
   * never pay. */
  price?: number;
} & (
  | { run(args: string): CommandResult | Promise<CommandResult>; prompt?: never }
  | {
      /** The prompt template (see buildPrompt), read each time so edits apply at once. */
      prompt: () => string;
      run?: never;
    }
);

const done = (reply: string): CommandResult => ({ ok: true, reply });
const failed = (reply: string): CommandResult => ({ ok: false, reply });

/** The commands the bot starts with. */
export function builtInCommands({
  room,
  billing,
  talker,
  prompts = {},
  thanker,
}: {
  /** Who the bot plays. */
  room: Pick<RoomState, 'persona'>;
  billing?: Billing;
  /** For saying something to the streamer, now or every so often. */
  talker?: Pick<Talker, 'interval' | 'talkNow'>;
  /** The prompts of the commands that ask Claude with their own. */
  prompts?: { songId?: () => string };
  /** For thanking big givers. */
  thanker?: Pick<GiftThanker, 'threshold'>;
}): Command[] {
  return [
    {
      name: '修改人设',
      adminOnly: true,
      price: 0,
      run(args) {
        if (!args) return failed('人设不能为空，用法：/修改人设 人设');
        room.persona = args;
        return done('已处理修改人设请求');
      },
    },
    {
      name: '修改收费',
      adminOnly: true,
      price: 0,
      run(args) {
        if (!/^\d+$/.test(args)) return failed('收费要写成钻石数，用法：/修改收费 2');
        if (!billing) return failed('这次运行没有开收费，改不了');
        billing.cost = Number(args);
        return done('已处理修改收费请求');
      },
    },
    {
      name: '回复',
      adminOnly: true,
      price: 0,
      async run() {
        if (!talker) return failed('这次运行没有开自动回复，回复不了');
        // The message itself says it worked.
        return (await talker.talkNow()) ? done('') : failed('没想好说什么，这次没有回复');
      },
    },
    {
      name: '自动回复间隔',
      adminOnly: true,
      price: 0,
      run(args) {
        if (!/^\d+$/.test(args))
          return failed('间隔要写成分钟数，0 表示关闭，用法：/自动回复间隔 3');
        if (!talker) return failed('这次运行没有开自动回复，改不了');
        talker.interval = Number(args) * 60_000;
        return done('已处理自动回复间隔请求');
      },
    },
    {
      name: '自动谢礼',
      adminOnly: true,
      price: 0,
      run(args) {
        if (!/^\d+$/.test(args)) return failed('阈值要写成钻石数，用法：/自动谢礼 100');
        if (!thanker) return failed('这次运行没有开自动谢礼，改不了');
        thanker.threshold = Number(args);
        return done('已处理自动谢礼请求');
      },
    },
    // Anyone can ask, at a mention's price: Claude works out the song from the lyrics heard.
    ...(prompts.songId
      ? [{ name: '识歌', adminOnly: false, prompt: prompts.songId } satisfies Command]
      : []),
  ];
}
