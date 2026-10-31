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
    { thanksThreshold: -1, autoSongId: 'yes', screenshots: true, maxReplyParts: 3 },
    last,
    problems,
  );
  expect(got).toMatchObject({
    thanksThreshold: 50,
    autoSongId: true,
    screenshots: true,
    maxReplyParts: 3,
  });
  expect(problems).toEqual([
    'thanksThreshold must be a number, 0 or more',
    'autoSongId must be true or false',
  ]);
});

test('the prompt lists the settings that show there, in order, as they are', () => {
  expect(settingsText({ ...SETTING_DEFAULTS, autoReplyThreshold: 0.6, screenshots: true })).toBe(
    [
      '直播间现在的设置（机器人管理员可以用指令修改）：',
      '- 截图：开（你能看到直播画面）',
      '- 自动回复：开（观众或主播说到你、跟你说话时，你会主动接一句；判断的阈值是 0.6，两次之间至少隔 60 秒）',
      '- 自动谢礼：关闭',
      '- 自动识歌：关闭',
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
