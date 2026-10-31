import { z } from 'zod';

/** How hard Codex thinks about a puzzle: `high` takes up to 10 minutes instead of 6. */
export type SolveEffort = 'medium' | 'high';

/**
 * What admins can change while the bot runs, kept per room in `room_config.json` (one field each,
 * same names), read hot: editing the file changes the running bot at once. Each is defined once, in
 * SETTINGS below: its default, bounds, command, tool text and how the prompt shows it.
 */
export interface Settings {
  /** How likely something must be about the bot for it to reply unprompted; 1 or more never (`/自动回复阈值`). */
  autoReplyThreshold: number;
  /** Seconds it keeps quiet after talking unprompted; 0 doesn't wait (`/自动回复间隔`). */
  autoReplyIntervalSeconds: number;
  /** Seconds between two things Claude says to the room unprompted (auto message); 0 off (`/自动消息间隔`). */
  autoMessageIntervalSeconds: number;
  /** Viewers whose gifts within 5 minutes pass this many diamonds are thanked (`/自动谢礼`). */
  thanksThreshold: number;
  /** Whether it names the songs the streamer sings without being asked (`/自动识歌`). */
  autoSongId: boolean;
  /** Whether it @s viewers who keep posting malicious chat (`/识别恶意言论`). */
  maliceWatch: boolean;
  /** Whether it may send the streamer a 小心心 of its own accord when she makes it happy (`/开心送心`). */
  happyHeart: boolean;
  /** Whether prompts get a screenshot of the live video (`/截图`). */
  screenshots: boolean;
  /** The most messages one @'s answer is split into (`/最大回复条数`, `--max-parts`). */
  maxReplyParts: number;
  /** How hard Codex thinks about a puzzle (`ask_about_puzzle`); nothing but the file sets it. */
  solveEffort: SolveEffort;
}

/** The tool and `/` command that change a setting. */
export interface SettingTool {
  /** The tool's name: `set_auto_reply_threshold`. */
  name: string;
  /** The `/` command that does the same, without the slash: `自动回复阈值`. */
  command: string;
  /** What Claude is told the tool is for. */
  description: string;
  /** What is said back for a typed `/` whose argument isn't valid. */
  usage: string;
  /** The argument's name in the tool's input schema (`threshold`; `on` for a switch). */
  arg: string;
  /** More for the result, from the value just set (the thanks tool says whether it is on). */
  extra?: (after: number) => object;
}

/** One setting: what it is, and everything the tool, the command line and the prompt say of it. */
export interface SettingSpec<V> {
  default: V;
  /**
   * What a value must be for the tool: bounds and the argument's description for Claude. A value
   * in room_config.json or on the command line only has to be `valid`.
   */
  schema: z.ZodType<V>;
  /** What a value of this kind must be wherever it is read from: a count, a boolean or a choice. */
  valid: z.ZodType<V>;
  /** What's wrong with a value that isn't `valid`, after `<name> must be`. */
  problem: string;
  /** The command-line flag that gives it at start, without the dashes. */
  flag?: string;
  /** Its tool and `/` command; none for a setting only the file changes. */
  tool?: SettingTool;
  /** The line the prompt's `{{settings}}` has for it, in `order`; none for one it doesn't show. */
  prompt?: { order: number; line: (settings: Readonly<Settings>) => string };
  /** A number's bounds, for the tool's error text (the same as `schema`'s). */
  integer?: boolean;
  min?: number;
  max?: number;
}

type Common<V> = Pick<SettingSpec<V>, 'flag' | 'tool' | 'prompt'>;

/** A number, 0 or more, as room_config.json and the command line may hold it. */
const count = z.number().min(0);

/** A setting that is a number: `describe` is the argument's description for Claude. */
function numberSetting(
  initial: number,
  bounds: { integer?: boolean; min: number; max?: number; describe: string },
  common: Common<number> = {},
): SettingSpec<number> {
  let schema = bounds.integer ? z.number().int() : z.number();
  schema = schema.min(bounds.min);
  if (bounds.max !== undefined) schema = schema.max(bounds.max);
  return {
    default: initial,
    schema: schema.describe(bounds.describe),
    valid: count,
    problem: 'a number, 0 or more',
    integer: bounds.integer,
    min: bounds.min,
    max: bounds.max,
    ...common,
  };
}

/** A setting that is on or off. */
function switchSetting(initial: boolean, common: Common<boolean> = {}): SettingSpec<boolean> {
  return {
    default: initial,
    schema: z.boolean().describe('true 打开，false 关闭'),
    valid: z.boolean(),
    problem: 'true or false',
    ...common,
  };
}

/** A threshold this high means thanks are off: nobody gives that much in 5 minutes. */
export const THANKS_OFF_FROM = 99999;

/**
 * Every setting, in the order room_config.json lists them. The tools (`settingTool`), the command
 * line (`cli-options.ts`), room_config.json's checks (`settingsFrom`) and the prompt's
 * `{{settings}}` all read this one table.
 */
export const SETTINGS: { [K in keyof Settings]: SettingSpec<Settings[K]> } = {
  autoReplyThreshold: numberSetting(
    1,
    { min: 0, describe: '0 到 1 的小数；1 以上关闭自动回复' },
    {
      flag: 'auto-reply-threshold',
      tool: {
        name: 'set_auto_reply_threshold',
        command: '自动回复阈值',
        description:
          '改自动回复的阈值：观众或主播说到机器人、跟它说话时，Jev 判断的把握到这个数就主动接一句，0 到 1，1 以上关闭。有人要开、关自动回复或改阈值时调用（「把自动回复打开」填 0.6）。',
        usage: '阈值要写成 0 到 1 之间的小数，1 表示关闭，用法：/自动回复阈值 0.6',
        arg: 'threshold',
      },
      prompt: {
        order: 2,
        line: ({ autoReplyThreshold, autoReplyIntervalSeconds }) =>
          `- 自动回复：${autoReplyThreshold < 1 ? `开（观众或主播说到你、跟你说话时，你会主动接一句；判断的阈值是 ${autoReplyThreshold}，两次之间至少隔 ${autoReplyIntervalSeconds} 秒）` : '关闭'}`,
      },
    },
  ),
  autoReplyIntervalSeconds: numberSetting(
    60,
    { integer: true, min: 0, describe: '秒数；0 不等' },
    {
      flag: 'auto-reply-interval',
      tool: {
        name: 'set_auto_reply_interval',
        command: '自动回复间隔',
        description: '改自动回复的间隔：主动接过一句后安静多少秒，0 不等。',
        usage: '间隔要写成秒数，0 表示不等，用法：/自动回复间隔 20',
        arg: 'seconds',
      },
    },
  ),
  autoMessageIntervalSeconds: numberSetting(
    0,
    { integer: true, min: 0, describe: '秒数；0 关闭' },
    {
      tool: {
        name: 'set_auto_message_interval',
        command: '自动消息间隔',
        description:
          '改自动消息的间隔：每隔多少秒，机器人看一眼直播间（主播说的、弹幕），自己发一条弹幕（没什么可说就不发），0 关闭。和自动回复无关。',
        usage: '间隔要写成秒数，0 表示关闭，用法：/自动消息间隔 300',
        arg: 'seconds',
      },
    },
  ),
  thanksThreshold: numberSetting(
    THANKS_OFF_FROM,
    { integer: true, min: 0, describe: `钻石数；关掉自动谢礼填 ${THANKS_OFF_FROM}` },
    {
      flag: 'thanks-threshold',
      tool: {
        name: 'set_thanks_threshold',
        command: '自动谢礼',
        description: `改自动谢礼的门槛：观众 5 分钟内送的礼物超过 diamonds 钻就谢 TA。有人要开、关自动谢礼或改门槛时调用（「以后 100 钻以下的礼物不用谢了」就填 100）；关掉就填 ${THANKS_OFF_FROM}。`,
        usage: '阈值要写成钻石数，用法：/自动谢礼 100',
        arg: 'diamonds',
        extra: (diamonds: number) => ({ on: diamonds < THANKS_OFF_FROM }),
      },
      prompt: {
        order: 3,
        line: ({ thanksThreshold }) =>
          `- 自动谢礼：${thanksThreshold >= THANKS_OFF_FROM ? '关闭' : `5 分钟内送礼超过 ${thanksThreshold} 钻的观众会收到感谢`}`,
      },
    },
  ),
  autoSongId: switchSetting(false, {
    flag: 'auto-song-id',
    tool: {
      name: 'set_auto_song_id',
      command: '自动识歌',
      description: '开关自动识歌：开着时主播唱歌，机器人自己认出是什么歌并说出来。',
      usage: '要写 0（关闭）或 1（打开），用法：/自动识歌 1',
      arg: 'on',
    },
    prompt: {
      order: 4,
      line: ({ autoSongId }) =>
        `- 自动识歌：${autoSongId ? '开（主播唱歌时，你会自己认出是什么歌并说出来）' : '关闭'}`,
    },
  }),
  maliceWatch: switchSetting(false, {
    flag: 'malice-watch',
    tool: {
      name: 'set_malice_watch',
      command: '识别恶意言论',
      description: '开关恶意言论识别：开着时 @ 发恶意弹幕的观众。',
      usage: '要写 0（关闭）或 1（打开），用法：/识别恶意言论 1',
      arg: 'on',
    },
  }),
  happyHeart: switchSetting(false, {
    tool: {
      name: 'set_happy_heart',
      command: '开心送心',
      description:
        '开关开心送心：开着时，主播让机器人真心开心了（夸它、唱得特别好），它会自己给主播送一个小心心（1 钻，4 分钟最多一个）。',
      usage: '要写 0（关闭）或 1（打开），用法：/开心送心 1',
      arg: 'on',
    },
  }),
  screenshots: switchSetting(false, {
    flag: 'screenshot',
    tool: {
      name: 'set_screenshots',
      command: '截图',
      description:
        '开关直播画面截图：开着时每个问题都带一张截图给你看。有人要你看画面、看题、看板书，或要关掉时调用。',
      usage: '要写 0（关闭）或 1（打开），用法：/截图 1',
      arg: 'on',
    },
    prompt: {
      order: 1,
      line: ({ screenshots }) =>
        `- 截图：${screenshots ? '开（你能看到直播画面）' : '关（你看不到直播画面）'}`,
    },
  }),
  maxReplyParts: numberSetting(
    5,
    { integer: true, min: 1, max: 10, describe: '条数，1 到 10' },
    {
      flag: 'max-parts',
      tool: {
        name: 'set_max_reply_parts',
        command: '最大回复条数',
        description: '改一条回答最多拆成几条弹幕（1 到 10）。',
        usage: '条数要写成 1 到 10 的整数，用法：/最大回复条数 3',
        arg: 'parts',
      },
    },
  ),
  solveEffort: {
    default: 'medium',
    schema: z.enum(['medium', 'high']),
    valid: z.enum(['medium', 'high']),
    problem: 'one of medium, high',
  },
};

/** Each setting's value when neither room_config.json nor the command line says. */
export const SETTING_DEFAULTS: Readonly<Settings> = Object.fromEntries(
  Object.entries(SETTINGS).map(([name, spec]) => [name, spec.default]),
) as unknown as Settings;

/** The settings' names, in the order room_config.json lists them. */
export const SETTING_NAMES = Object.keys(SETTINGS) as (keyof Settings)[];

/**
 * The settings in `raw` (a parsed room_config.json), each checked on its own: a missing one is its
 * default, and one of the wrong kind (a boolean, a count, or one of a choice's values) is
 * `fallback`'s value for it (the last good settings), with what's wrong with it in `problems`, so
 * one bad value doesn't cost the others.
 */
export function settingsFrom(
  raw: Readonly<Record<string, unknown>>,
  fallback: Readonly<Settings> = SETTING_DEFAULTS,
  problems: string[] = [],
): Settings {
  const settings: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const name of SETTING_NAMES) {
    const value = raw[name];
    if (value === undefined) continue;
    const spec = SETTINGS[name];
    if (!spec.valid.safeParse(value).success) {
      problems.push(`${name} must be ${spec.problem}`);
      settings[name] = fallback[name];
      continue;
    }
    settings[name] = value;
  }
  return settings as unknown as Settings;
}

/**
 * How the bot is set up in the room right now, as lines for the prompt's `{{settings}}`: the
 * settings that show there, each in its place.
 */
export function settingsText(settings: Readonly<Settings>): string {
  const shown = SETTING_NAMES.flatMap((name) => {
    const prompt = SETTINGS[name].prompt;
    return prompt ? [prompt] : [];
  }).sort((a, b) => a.order - b.order);
  return [
    '直播间现在的设置（机器人管理员可以用指令修改）：',
    ...shown.map((prompt) => prompt.line(settings)),
  ].join('\n');
}
