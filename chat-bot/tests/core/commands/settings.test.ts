import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SETTING_DEFAULTS,
  SETTING_NAMES,
  SETTINGS,
  settingsFrom,
  settingsText,
} from '../../../src/core/commands/settings';

test('every setting has a default its own schema accepts', () => {
  for (const name of SETTING_NAMES) {
    const spec = SETTINGS[name];
    expect(spec.valid.safeParse(spec.default).success).toBe(true);
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
  }
  expect(SETTING_DEFAULTS).toMatchObject({ autoReplyThreshold: 1, maxReplyParts: 5 });
});

test('a value of the wrong kind falls back to the last good one, with what is wrong with it', () => {
  const problems: string[] = [];
  const last = { ...SETTING_DEFAULTS, thanksThreshold: 50, autoSongId: true };
  const got = settingsFrom(
    { thanksThreshold: -1, autoSongId: 'yes', maliceWatch: true, maxReplyParts: 3 },
    last,
    problems,
  );
  expect(got).toMatchObject({
    thanksThreshold: 50,
    autoSongId: true,
    maliceWatch: true,
    maxReplyParts: 3,
  });
  expect(problems).toEqual([
    'thanksThreshold must be a number, 0 or more',
    'autoSongId must be true or false',
  ]);
});

test('the prompt lists the settings that show there, in order, as they are', () => {
  expect(settingsText({ ...SETTING_DEFAULTS, autoReplyThreshold: 0.6 })).toBe(
    [
      '直播间现在的设置（机器人管理员可以用指令修改）：',
      '- 自动回复：开（观众或主播说到你、跟你说话时，你会主动接一句；判断的阈值是 0.6，两次之间至少隔 60 秒）',
      '- 随机回复：关闭',
      '- 主动说话：关闭',
      '- 自动谢礼：关闭',
      '- 自动识歌：关闭',
    ].join('\n'),
  );
});

test('the prompt says how each feature that is on works: thanks over a threshold, random replies by chance, proactive talk, song id', () => {
  expect(
    settingsText({
      ...SETTING_DEFAULTS,
      thanksThreshold: 100,
      randomReplyChance: 0.15,
      proactiveTalkMinutes: 5,
      autoSongId: true,
    }),
  ).toBe(
    [
      '直播间现在的设置（机器人管理员可以用指令修改）：',
      '- 自动回复：关闭',
      '- 随机回复：开（每条弹幕有 15% 的机会交给你，没人跟你说话也可以接一句，不想接就不接）',
      '- 主动说话：开（每 5 分钟你会想想此刻的念头，有值得说的才说一句）',
      '- 自动谢礼：5 分钟内送礼超过 100 钻的观众会收到感谢',
      '- 自动识歌：开（主播唱歌时，你会自己认出是什么歌并说出来）',
    ].join('\n'),
  );
});

describe('docs/commands.md', () => {
  const doc = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'commands.md'), 'utf8');
  const lines = doc.split('\n');

  test('lists every setting with a command, with its tool, in the commands table', () => {
    for (const { tool } of Object.values(SETTINGS)) {
      if (!tool) continue;
      const row = lines.find((line) => line.startsWith(`| \`/${tool.command}`));
      expect(row).toBeDefined();
      expect(row).toContain(`\`${tool.name}\``);
      expect(doc).toContain(`### /${tool.command}`);
    }
  });

  test('lists every setting by its room_config.json field with its default', () => {
    for (const name of SETTING_NAMES) {
      const row = lines.find((line) => line.includes(`| \`${name}\``));
      expect(row).toBeDefined();
      expect(row).toContain(JSON.stringify(SETTINGS[name].default).replace(/^"|"$/g, ''));
    }
  });
});
