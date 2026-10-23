import type { Log } from '../app/ports';
import type { BotTool } from './rpc';

export interface OnOffToolOptions {
  /** The tool's name: `set_screenshots`. */
  name: string;
  /** The `/` command that does the same, without the slash: `截图`. */
  command: string;
  description: string;
  get(): boolean;
  set(on: boolean): void;
  log: Log;
}

/**
 * A tool that turns a feature on or off, as `/<command> 1` and `/<command> 0` do. Admin-only, and
 * it answers the setting before and after, for Claude to say in its own words.
 */
export function onOffTool(options: OnOffToolOptions): BotTool {
  const { name, command, description, log } = options;
  const usage = `要写 0（关闭）或 1（打开），用法：/${command} 1`;
  return {
    name,
    description,
    adminOnly: true,
    inputSchema: {
      type: 'object',
      properties: { on: { type: 'boolean', description: 'true 打开，false 关闭' } },
      required: ['on'],
    },
    commands: [
      {
        name: command,
        parse: (args) =>
          args === '0' || args === '1' ? { args: { on: args === '1' } } : { usage },
        say: () => `已处理${command}请求`,
      },
    ],
    call({ on }) {
      if (typeof on !== 'boolean')
        return Promise.resolve({ text: 'on 要写成 true 或 false', isError: true });
      const before = options.get();
      options.set(on);
      log.info('setting', { command, before, after: on });
      return Promise.resolve({ text: JSON.stringify({ before, after: on }) });
    },
  };
}

export interface NumberToolOptions {
  /** The tool's name: `set_auto_reply_threshold`. */
  name: string;
  /** The `/` command that does the same, without the slash: `自动回复阈值`. */
  command: string;
  description: string;
  /** The argument's name in the schema and its description for Claude. */
  arg: { name: string; description: string };
  /** What a value must be; `usage` is said back for a typed `/` that isn't. */
  integer?: boolean;
  min?: number;
  max?: number;
  usage: string;
  get(): number;
  set(value: number): void;
  /** More for the result, from the value just set (the thanks tool says whether it is on). */
  extra?: (after: number) => object;
  log: Log;
}

/**
 * A tool that sets a number a feature keeps, as `/<command> <n>` does. Admin-only, and it answers
 * the number before and after, for Claude to say in its own words.
 */
export function numberTool(options: NumberToolOptions): BotTool {
  const { name, command, description, arg, integer, min, max, usage, extra, log } = options;
  const valid = (value: number) =>
    Number.isFinite(value) &&
    (!integer || Number.isInteger(value)) &&
    (min === undefined || value >= min) &&
    (max === undefined || value <= max);
  const range =
    min !== undefined && max !== undefined
      ? `，${min} 到 ${max}`
      : min !== undefined
        ? `，不小于 ${min}`
        : '';
  return {
    name,
    description,
    adminOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        [arg.name]: {
          type: integer ? 'integer' : 'number',
          ...(min !== undefined && { minimum: min }),
          ...(max !== undefined && { maximum: max }),
          description: arg.description,
        },
      },
      required: [arg.name],
    },
    commands: [
      {
        name: command,
        parse: (args) => {
          const typed = (integer ? /^\d+$/ : /^\d+(\.\d+)?$/).test(args) ? Number(args) : NaN;
          return valid(typed) ? { args: { [arg.name]: typed } } : { usage };
        },
        say: () => `已处理${command}请求`,
      },
    ],
    call(args) {
      const value = args[arg.name];
      if (typeof value !== 'number' || !valid(value)) {
        return Promise.resolve({
          text: `${arg.name} 要写成${integer ? '整数' : '数'}${range}`,
          isError: true,
        });
      }
      const before = options.get();
      options.set(value);
      log.info('setting', { command, before, after: value });
      return Promise.resolve({
        text: JSON.stringify({ before, after: value, ...extra?.(value) }),
      });
    },
  };
}
