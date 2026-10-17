import type { Billing } from './billing';
import type { Talker } from './talker';

/** Who the bot plays, shared by the commands that change it and the prompts that use it. */
export interface Persona {
  value: string;
}

/**
 * What a command came to: `reply` is what the bot says back, nothing when empty (the command
 * spoke for itself). A failed one is refunded.
 */
export interface CommandResult {
  ok: boolean;
  reply: string;
}

/** Something viewers can tell the bot to do, as `@机器人/<name> <args>`. */
export interface Command {
  name: string;
  /** Only admins can run it; anyone else's call is ignored. */
  adminOnly: boolean;
  /** Diamonds it costs a viewer, taken before it runs; admins never pay. */
  price: number;
  run(args: string): CommandResult | Promise<CommandResult>;
}

const done = (reply: string): CommandResult => ({ ok: true, reply });
const failed = (reply: string): CommandResult => ({ ok: false, reply });

/** The commands the bot starts with. */
export function builtInCommands({
  persona,
  billing,
  talker,
}: {
  persona: Persona;
  billing?: Billing;
  /** For saying something to the streamer, now or every so often. */
  talker?: Pick<Talker, 'interval' | 'talkNow'>;
}): Command[] {
  return [
    {
      name: '修改人设',
      adminOnly: true,
      price: 0,
      run(args) {
        if (!args) return failed('人设不能为空，用法：/修改人设 人设');
        persona.value = args;
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
  ];
}
