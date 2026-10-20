import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdditionalCommands } from '../src/adapters/additional-command-files';
import { mentionIn, parseCommandIndex } from '../src/core/additional-command';

const fakeLog = () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });

const INDEX = {
  'can-sing': {
    name: '主播会唱xxx吗',
    when: '在问主播会不会唱',
    trigger: '会唱|能唱',
    prompt: 'can-sing/prompt.md',
    price: 0,
  },
  plain: { name: '别的', when: '在问别的', prompt: 'plain/prompt.md' },
  'no-prompt': { name: '缺东西', when: '在问' },
  outside: { name: '越界', when: '在问', prompt: '../prompt.md' },
  'bad-price': { name: '价', when: '在问', prompt: 'p.md', price: -1 },
};

test('reads the index: the commands by id, each checked', () => {
  const { commands, errors } = parseCommandIndex(INDEX);
  expect(commands).toEqual([
    {
      id: 'can-sing',
      name: '主播会唱xxx吗',
      when: '在问主播会不会唱',
      trigger: /会唱|能唱/,
      prompt: 'can-sing/prompt.md',
      price: 0,
    },
    { id: 'plain', name: '别的', when: '在问别的', trigger: null, prompt: 'plain/prompt.md' },
  ]);
  expect(errors).toEqual([
    'no-prompt: prompt must be a non-empty string',
    'outside: prompt must be inside the folder: ../prompt.md',
    'bad-price: price must be whole diamonds, 0 or more',
  ]);
  expect(
    parseCommandIndex({ x: { name: 'x', when: 'y', prompt: 'p.md', trigger: '(' } }).errors,
  ).toEqual(['x: trigger is not a regular expression: (']);
  expect(parseCommandIndex([]).errors).toEqual(['index.json must be an object of commands by id']);
  const flagged = { name: 'x', when: 'y', prompt: 'p.md', adminOnly: true, atOthers: true };
  expect(parseCommandIndex({ x: flagged }).commands[0]).toMatchObject({
    adminOnly: true,
    atOthers: true,
  });
  expect(parseCommandIndex({ x: { ...flagged, adminOnly: 'yes' } }).errors).toEqual([
    'x: adminOnly must be true or false',
  ]);
  expect(parseCommandIndex({ x: { ...flagged, cooldown: 120 } }).commands[0]).toMatchObject({
    cooldown: 120,
  });
  expect(parseCommandIndex({ x: { ...flagged, cooldown: 1.5 } }).errors).toEqual([
    'x: cooldown must be whole seconds, 0 or more',
  ]);
});

test("loads the room's commands, each prompt with the room's files it names filled in, read on every use", () => {
  const room = mkdtempSync(join(tmpdir(), 'additional-command-'));
  const dir = join(room, 'additional_commands');
  mkdirSync(join(dir, 'can-sing'), { recursive: true });
  mkdirSync(join(dir, 'plain'));
  mkdirSync(join(room, 'artifacts'));
  writeFileSync(join(dir, 'index.json'), JSON.stringify(INDEX));
  writeFileSync(
    join(dir, 'can-sing', 'prompt.md'),
    '歌单：{{file:artifacts/songs.txt}}，{{asker}}，{{file:../secret}}，{{file:missing.txt}}',
  );
  writeFileSync(join(dir, 'plain', 'prompt.md'), '没有文件');
  writeFileSync(join(room, 'artifacts', 'songs.txt'), '晴天\n');
  const log = fakeLog();

  const commands = loadAdditionalCommands(room, { log });
  expect(commands.map(({ id, price }) => [id, price])).toEqual([
    ['can-sing', 0],
    ['plain', undefined],
  ]);
  expect(log.warn).toHaveBeenCalledTimes(3);
  // Other {{key}}s are left for the prompt's own; nothing outside the room's folder is read.
  expect(commands[0]!.prompt()).toBe('歌单：晴天，{{asker}}，（读取失败），（读取失败）');
  expect(commands[1]!.prompt()).toBe('没有文件');

  writeFileSync(join(room, 'artifacts', 'songs.txt'), '稻香');
  writeFileSync(join(dir, 'plain', 'prompt.md'), '改了');
  expect(commands[0]!.prompt()).toMatch(/^歌单：稻香，/);
  expect(commands[1]!.prompt()).toBe('改了');
});

test('a room without additional_commands/index.json has no commands, and one that is not JSON says so', () => {
  expect(
    loadAdditionalCommands(mkdtempSync(join(tmpdir(), 'additional-command-')), { log: fakeLog() }),
  ).toEqual([]);
  const room = mkdtempSync(join(tmpdir(), 'additional-command-'));
  mkdirSync(join(room, 'additional_commands'));
  writeFileSync(join(room, 'additional_commands', 'index.json'), '{ "can-sing": ');
  const log = fakeLog();
  expect(loadAdditionalCommands(room, { log })).toEqual([]);
  expect(log.warn).toHaveBeenCalledWith(
    'additional_commands/index.json is not JSON, no commands',
    expect.anything(),
  );
});

test('finds the longest listed phrase a chat contains, ignoring case', () => {
  const titles = '喂猪\n喂猪歌\nLemon\n\n  晴天  \n';
  expect(mentionIn('虾虾会喂猪歌吗', titles)).toBe('喂猪歌');
  expect(mentionIn('会唱lemon吗', titles)).toBe('Lemon');
  expect(mentionIn('今天晴天', titles)).toBe('晴天');
  expect(mentionIn('晚上吃什么', titles)).toBeNull();
});

test("a command's mentions file is read on each use, and a missing one mentions nothing", () => {
  const room = mkdtempSync(join(tmpdir(), 'additional-command-'));
  mkdirSync(join(room, 'additional_commands', 'can-sing'), { recursive: true });
  writeFileSync(
    join(room, 'additional_commands', 'index.json'),
    JSON.stringify({
      'can-sing': {
        name: '会唱',
        when: '在问',
        prompt: 'can-sing/prompt.md',
        mentions: 'artifacts/titles.txt',
      },
    }),
  );
  const [command] = loadAdditionalCommands(room, { log: fakeLog() });
  expect(command!.mentioned!('虾虾会喂猪吗')).toBeNull();
  mkdirSync(join(room, 'artifacts'));
  writeFileSync(join(room, 'artifacts', 'titles.txt'), '喂猪\n');
  expect(command!.mentioned!('虾虾会喂猪吗')).toBe('喂猪');
  expect(
    parseCommandIndex({ x: { name: 'x', when: 'y', prompt: 'p.md', mentions: '../t.txt' } }).errors,
  ).toEqual(['x: mentions must be a file inside the room folder']);
});
