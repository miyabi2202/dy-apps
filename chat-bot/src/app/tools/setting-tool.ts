import { z } from 'zod';
import { SETTINGS, type Settings } from '../../core/commands/settings';
import type { Log, SettingsStore } from '../ports';
import type { BotTool } from '../../core/tools/bot-tool';

/**
 * The tool that changes one setting, built from its entry in SETTINGS: its name, `/` command,
 * description, usage and bounds are there. It is what `/<command> <value>` and Claude, asked in
 * words, both call. Admin-only, and it answers the setting before and after, for Claude to say in
 * its own words.
 */
export function settingTool<K extends keyof Settings>(
  name: K,
  options: { settings: SettingsStore; log: Log },
): BotTool {
  const { settings, log } = options;
  const spec = SETTINGS[name];
  const tool = spec.tool;
  if (!tool) throw new Error(`setting ${name} has no tool`);
  const { arg, command } = tool;
  const isSwitch = typeof spec.default === 'boolean';
  // Just what Claude needs: the type, bounds and description of the one argument.
  const { type, properties, required } = z.toJSONSchema(z.object({ [arg]: spec.schema }));
  const inputSchema = { type, properties, required };
  const range =
    spec.min !== undefined && spec.max !== undefined
      ? `，${spec.min} 到 ${spec.max}`
      : spec.min !== undefined
        ? `，不小于 ${spec.min}`
        : '';
  const parse = (args: string): unknown => {
    if (isSwitch) return args === '0' ? false : args === '1' ? true : undefined;
    return (spec.integer ? /^\d+$/ : /^\d+(\.\d+)?$/).test(args) ? Number(args) : undefined;
  };
  return {
    name: tool.name,
    description: tool.description,
    adminOnly: true,
    inputSchema,
    commands: [
      {
        name: command,
        parse: (args) => {
          const typed = parse(args);
          return typed !== undefined && spec.schema.safeParse(typed).success
            ? { args: { [arg]: typed } }
            : { usage: tool.usage };
        },
        say: () => `已处理${command}请求`,
      },
    ],
    call(args) {
      const value = args[arg];
      if (!spec.schema.safeParse(value).success) {
        return Promise.resolve({
          text: isSwitch
            ? `${arg} 要写成 true 或 false`
            : `${arg} 要写成${spec.integer ? '整数' : '数'}${range}`,
          isError: true,
        });
      }
      const before = settings.get()[name];
      settings.set({ [name]: value });
      log.info('setting', { command, before, after: value });
      return Promise.resolve({
        text: JSON.stringify({
          before,
          after: value,
          ...(typeof value === 'number' && tool.extra?.(value)),
        }),
      });
    },
  };
}
