import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdditionalCommands } from '../src/adapters/additional-command-files';
import { parseCommandIndex } from '../src/core/additional-command';

const fakeLog = () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });

const INDEX = `# 这个直播间自己的指令

- name：这里只是说明

## can-sing

- name: 主播会唱xxx吗
- when: 在问主播会不会唱
- trigger: 会唱|能唱
- prompt: can-sing/prompt.md

## plain

- name: 别的
- when: 在问别的
- prompt: plain/prompt.md

## no-prompt

- name: 缺东西
- when: 在问

## outside

- name: 越界
- when: 在问
- prompt: ../prompt.md
`;

test('reads the index: a ## heading per command, its fields under it', () => {
  const { commands, errors } = parseCommandIndex(INDEX);
  expect(commands).toEqual([
    {
      id: 'can-sing',
      name: '主播会唱xxx吗',
      when: '在问主播会不会唱',
      trigger: /会唱|能唱/,
      prompt: 'can-sing/prompt.md',
    },
    { id: 'plain', name: '别的', when: '在问别的', trigger: null, prompt: 'plain/prompt.md' },
  ]);
  expect(errors).toEqual([
    'no-prompt: needs name, when and prompt',
    'outside: prompt must be inside the folder: ../prompt.md',
  ]);
  expect(
    parseCommandIndex('## x\n- name: x\n- when: y\n- prompt: p.md\n- trigger: (').errors,
  ).toEqual(['x: trigger is not a regular expression: (']);
});

test("loads the room's commands, each prompt with the room's files it names filled in, read on every use", () => {
  const room = mkdtempSync(join(tmpdir(), 'additional-command-'));
  const dir = join(room, 'additional_commands');
  mkdirSync(join(dir, 'can-sing'), { recursive: true });
  mkdirSync(join(dir, 'plain'));
  mkdirSync(join(room, 'artifacts'));
  writeFileSync(join(dir, 'index.md'), INDEX);
  writeFileSync(
    join(dir, 'can-sing', 'prompt.md'),
    '歌单：{{file:artifacts/songs.txt}}，{{asker}}，{{file:../secret}}，{{file:missing.txt}}',
  );
  writeFileSync(join(dir, 'plain', 'prompt.md'), '没有文件');
  writeFileSync(join(room, 'artifacts', 'songs.txt'), '晴天\n');
  const log = fakeLog();

  const commands = loadAdditionalCommands(room, { log });
  expect(commands.map(({ id }) => id)).toEqual(['can-sing', 'plain']);
  expect(log.warn).toHaveBeenCalledTimes(2);
  // Other {{key}}s are left for the prompt's own; nothing outside the room's folder is read.
  expect(commands[0]!.prompt()).toBe('歌单：晴天，{{asker}}，（读取失败），（读取失败）');
  expect(commands[1]!.prompt()).toBe('没有文件');

  writeFileSync(join(room, 'artifacts', 'songs.txt'), '稻香');
  writeFileSync(join(dir, 'plain', 'prompt.md'), '改了');
  expect(commands[0]!.prompt()).toMatch(/^歌单：稻香，/);
  expect(commands[1]!.prompt()).toBe('改了');
});

test('a room without additional_commands/index.md has no commands', () => {
  expect(
    loadAdditionalCommands(mkdtempSync(join(tmpdir(), 'additional-command-')), { log: fakeLog() }),
  ).toEqual([]);
});
