import { settingTool } from '../../../src/app/tools/setting-tool';
import { SETTINGS, type Settings } from '../../../src/core/commands/settings';
import { fakeSettings } from '../../support/fake-settings';
import { silentLog } from '../../support/fakes';

const context = { asker: '雅', question: '', admin: true };

function setup(name: keyof Settings, initial: Partial<Settings> = {}) {
  const lines: [string, object | undefined][] = [];
  const log = {
    ...silentLog,
    info: (message: string, meta?: object) => void lines.push([message, meta]),
  };
  const settings = fakeSettings(initial);
  return { tool: settingTool(name, { settings, log }), settings, lines };
}

describe('a switch (autoSongId)', () => {
  test('sets the setting, says what it was and is, and logs the change; admin-only', async () => {
    const { tool, settings, lines } = setup('autoSongId');
    expect(tool.adminOnly).toBe(true);
    expect(JSON.parse((await tool.call({ on: true }, context)).text)).toEqual({
      before: false,
      after: true,
    });
    expect(settings.get().autoSongId).toBe(true);
    expect(lines).toEqual([['setting', { command: '自动识歌', before: false, after: true }]]);
  });

  test('anything but true or false is an error, and changes nothing', async () => {
    const { tool, settings } = setup('autoSongId');
    for (const on of ['1', 1, undefined]) {
      expect(await tool.call({ on }, context)).toMatchObject({
        text: 'on 要写成 true 或 false',
        isError: true,
      });
    }
    expect(settings.get().autoSongId).toBe(false);
  });

  test('/自动识歌 takes 0 or 1, and says it was handled', () => {
    const [command] = setup('autoSongId').tool.commands!;
    expect(command!.name).toBe('自动识歌');
    expect(command!.parse('1')).toEqual({ args: { on: true } });
    expect(command!.parse('0')).toEqual({ args: { on: false } });
    expect(command!.parse('开')).toEqual({
      usage: '要写 0（关闭）或 1（打开），用法：/自动识歌 1',
    });
    expect(command!.say({ text: '{}' }, { on: true })).toBe('已处理自动识歌请求');
  });
});

describe('a whole number within limits (maxReplyParts)', () => {
  test('sets the number, says what it was and is, and logs the change; admin-only', async () => {
    const { tool, settings, lines } = setup('maxReplyParts');
    expect(tool.adminOnly).toBe(true);
    expect(JSON.parse((await tool.call({ parts: 2 }, context)).text)).toEqual({
      before: 5,
      after: 2,
    });
    expect(settings.get().maxReplyParts).toBe(2);
    expect(lines).toEqual([['setting', { command: '最大回复条数', before: 5, after: 2 }]]);
  });

  test('a value of the wrong kind or out of range is an error, and changes nothing', async () => {
    const { tool, settings } = setup('maxReplyParts');
    for (const parts of ['2', 0, 11, 1.5, undefined]) {
      expect(await tool.call({ parts }, context)).toMatchObject({
        text: 'parts 要写成整数，1 到 10',
        isError: true,
      });
    }
    expect(settings.get().maxReplyParts).toBe(5);
  });

  test('gives the limits in the schema', () => {
    expect(setup('maxReplyParts').tool.inputSchema).toMatchObject({
      properties: { parts: { type: 'integer', minimum: 1, maximum: 10 } },
    });
  });

  test('/最大回复条数 takes a number within the limits, else says how to use it', () => {
    const [command] = setup('maxReplyParts').tool.commands!;
    const usage = { usage: '条数要写成 1 到 10 的整数，用法：/最大回复条数 3' };
    expect(command!.name).toBe('最大回复条数');
    expect(command!.parse('3')).toEqual({ args: { parts: 3 } });
    for (const typed of ['0', '11', '两', '2.5', '']) expect(command!.parse(typed)).toEqual(usage);
    expect(command!.say({ text: '{}' }, { parts: 3 })).toBe('已处理最大回复条数请求');
  });
});

describe('a decimal (autoReplyThreshold)', () => {
  test('takes one, as a command and as an argument', async () => {
    const { tool, settings } = setup('autoReplyThreshold');
    expect(tool.commands![0]!.parse('0.6')).toEqual({ args: { threshold: 0.6 } });
    expect(tool.commands![0]!.parse('一半')).toHaveProperty('usage');
    expect(JSON.parse((await tool.call({ threshold: 0.6 }, context)).text)).toEqual({
      before: 1,
      after: 0.6,
    });
    expect(settings.get().autoReplyThreshold).toBe(0.6);
    expect(tool.inputSchema).toMatchObject({ properties: { threshold: { type: 'number' } } });
  });
});

describe('a chance from 0 to 1 (randomReplyChance)', () => {
  test('/随机回复 takes a decimal from 0 to 1, else says how to use it', async () => {
    const { tool, settings } = setup('randomReplyChance');
    const [command] = tool.commands!;
    expect(command!.parse('0.1')).toEqual({ args: { chance: 0.1 } });
    expect(command!.parse('0')).toEqual({ args: { chance: 0 } });
    const usage = { usage: '概率要写成 0 到 1 之间的小数，0 表示关闭，用法：/随机回复 0.1' };
    for (const typed of ['1.5', '-0.1', '一成', '']) expect(command!.parse(typed)).toEqual(usage);
    expect(await tool.call({ chance: 2 }, context)).toMatchObject({ isError: true });
    expect(settings.get().randomReplyChance).toBe(0);
  });
});

describe('the thanks threshold', () => {
  test('sets it, admin-only, and says what it was and is, and whether the thanks are on', async () => {
    const { tool, settings } = setup('thanksThreshold');
    expect(tool.adminOnly).toBe(true);
    expect(JSON.parse((await tool.call({ diamonds: 100 }, context)).text)).toEqual({
      before: 99999,
      after: 100,
      on: true,
    });
    expect(settings.get().thanksThreshold).toBe(100);
    expect(JSON.parse((await tool.call({ diamonds: 99999 }, context)).text)).toMatchObject({
      on: false,
    });
  });

  test('anything but a whole number of diamonds is an error, and changes nothing', async () => {
    const { tool, settings } = setup('thanksThreshold', { thanksThreshold: 100 });
    for (const diamonds of ['100', -1, 1.5, undefined]) {
      expect(await tool.call({ diamonds }, context)).toMatchObject({ isError: true });
    }
    expect(settings.get().thanksThreshold).toBe(100);
  });

  test('/自动谢礼 takes a whole number of diamonds, and says it was handled', () => {
    const [command] = setup('thanksThreshold').tool.commands!;
    expect(command!.name).toBe('自动谢礼');
    expect(command!.parse('100')).toEqual({ args: { diamonds: 100 } });
    expect(command!.parse('一百')).toEqual({ usage: '阈值要写成钻石数，用法：/自动谢礼 100' });
    expect(command!.parse('')).toHaveProperty('usage');
    expect(command!.say({ text: '{}' }, { diamonds: 100 })).toBe('已处理自动谢礼请求');
  });
});

test('a setting without a tool in the registry (solveEffort) has none to make', () => {
  for (const [name, spec] of Object.entries(SETTINGS)) {
    if (!spec.tool) expect(() => setup(name as keyof Settings)).toThrow('has no tool');
  }
});
