import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  liveAdditionalCommands,
  loadAdditionalCommands,
} from '../../../src/adapters/files/additional-command-files';
import {
  appliesTo,
  mentionIn,
  mentionPhrases,
  parseCommandIndex,
  streamerNamesIn,
  userMatches,
  type UserCondition,
} from '../../../src/core/commands/additional-command';

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
    'no-prompt: needs a prompt, a fixedReply or a run',
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

test('a command may have a fixedReply instead of a prompt, or both', () => {
  const base = { name: 'x', when: 'y' };
  const { commands, errors } = parseCommandIndex({
    fixed: { ...base, fixedReply: '你好' },
    both: { ...base, fixedReply: '你好', prompt: 'p.md' },
    empty: { ...base, fixedReply: ' ' },
    number: { ...base, fixedReply: 5 },
    none: base,
  });
  expect(commands.map((c) => [c.id, c.prompt, c.fixedReply])).toEqual([
    ['fixed', undefined, '你好'],
    ['both', 'p.md', '你好'],
  ]);
  expect(errors).toEqual([
    'empty: fixedReply must be a non-empty string',
    'number: fixedReply must be a non-empty string',
    'none: needs a prompt, a fixedReply or a run',
  ]);
});

test("a command may run one of the bot's commands instead, another while the streamer is singing", () => {
  const base = { name: '这是什么歌', when: '在问现在放的是什么歌' };
  const { commands, errors } = parseCommandIndex({
    'what-song': { ...base, run: '/识别背景音乐', runWhileSinging: '识歌' },
    bgm: { ...base, run: '识别背景音乐' },
    'singing-only': { ...base, prompt: 'p.md', runWhileSinging: '识歌' },
    blank: { ...base, run: ' ' },
  });
  expect(commands.map((c) => [c.id, c.run, c.runWhileSinging])).toEqual([
    ['what-song', '识别背景音乐', '识歌'],
    ['bgm', '识别背景音乐', undefined],
  ]);
  expect(errors).toEqual([
    'singing-only: runWhileSinging needs a run',
    'blank: run must be a non-empty string',
  ]);
});

test('reads only and except: lists of conditions, each with a known field of the right type', () => {
  const base = { name: 'x', when: 'y', fixedReply: 'z' };
  const only = [{ badge: 'V', fansLevel: 3 }, { payLevel: 10 }, { admin: true }];
  const except = [{ badge: 'V' }, { badge: 'V年' }];
  const [command] = parseCommandIndex({ x: { ...base, only, except } }).commands;
  expect(command).toMatchObject({ only, except });

  const errors = (extra: object) => parseCommandIndex({ x: { ...base, ...extra } }).errors;
  expect(errors({ only: { badge: 'V' } })).toEqual([
    'x: only must be a non-empty list of conditions',
  ]);
  expect(errors({ except: [] })).toEqual(['x: except must be a non-empty list of conditions']);
  expect(errors({ only: ['V'] })).toEqual(['x: only condition 1 must be an object']);
  expect(errors({ only: [{ badge: 'V' }, { level: 3 }] })).toEqual([
    'x: only condition 2 has an unknown field "level" (use badge, fansLevel, payLevel, admin)',
  ]);
  expect(errors({ except: [{}] })).toEqual([
    'x: except condition 1 needs at least one of badge, fansLevel, payLevel, admin',
  ]);
  expect(errors({ only: [{ badge: 3 }] })).toEqual([
    'x: only condition 1: badge must be a non-empty string',
  ]);
  expect(errors({ only: [{ fansLevel: '10' }] })).toEqual([
    'x: only condition 1: fansLevel must be a whole number, 1 or more',
  ]);
  expect(errors({ only: [{ payLevel: 0 }] })).toEqual([
    'x: only condition 1: payLevel must be a whole number, 1 or more',
  ]);
  expect(errors({ only: [{ admin: false }] })).toEqual(['x: only condition 1: admin must be true']);
});

describe('userMatches', () => {
  const viewer = { admin: false };

  test('a viewer matches the list when they match any entry, an entry when they match all its fields', () => {
    const conditions: UserCondition[] = [{ badge: 'V', payLevel: 10 }, { admin: true }];
    expect(userMatches(conditions, { ...viewer, badges: ['V'], payLevel: 10 })).toBe(true);
    expect(userMatches(conditions, { ...viewer, badges: ['V'], payLevel: 9 })).toBe(false);
    expect(userMatches(conditions, { ...viewer, payLevel: 50 })).toBe(false);
    expect(userMatches(conditions, { admin: true })).toBe(true);
    expect(userMatches([], { admin: true })).toBe(false);
  });

  test('badges are matched exactly', () => {
    expect(userMatches([{ badge: 'V' }], { ...viewer, badges: ['V年'] })).toBe(false);
    expect(userMatches([{ badge: 'V' }], { ...viewer, badges: ['V年', 'V'] })).toBe(true);
    expect(userMatches([{ badge: 'V' }], viewer)).toBe(false);
  });

  test("the fan club counts when it's the streamer's, or doesn't say whose it is", () => {
    const fans = [{ fansLevel: 10 }];
    const club = (level: number, anchorId?: string) => ({
      ...viewer,
      fansClub: { level, anchorId },
    });
    expect(userMatches(fans, club(10, 's1'), 's1')).toBe(true);
    expect(userMatches(fans, club(9, 's1'), 's1')).toBe(false);
    expect(userMatches(fans, club(20, 's2'), 's1')).toBe(false);
    expect(userMatches(fans, club(10), 's1')).toBe(true);
    expect(userMatches(fans, club(10), undefined)).toBe(true);
    // Says whose, but the streamer isn't known yet: can't tell it's theirs.
    expect(userMatches(fans, club(10, 's1'), undefined)).toBe(false);
    expect(userMatches(fans, viewer, 's1')).toBe(false);
  });

  test('appliesTo needs a match of only and none of except; neither applies to everyone', () => {
    const fan = { ...viewer, payLevel: 30 };
    expect(appliesTo({}, viewer)).toBe(true);
    expect(appliesTo({ only: [{ payLevel: 30 }] }, fan)).toBe(true);
    expect(appliesTo({ only: [{ payLevel: 30 }] }, viewer)).toBe(false);
    expect(appliesTo({ except: [{ payLevel: 30 }] }, fan)).toBe(false);
    expect(appliesTo({ except: [{ payLevel: 30 }] }, viewer)).toBe(true);
    expect(appliesTo({ only: [{ payLevel: 30 }], except: [{ payLevel: 30 }] }, fan)).toBe(false);
  });
});

test('a mentions file may be a song list: the first column of its rows, brackets split, short ones left out', () => {
  const list = [
    '会唱的歌（3 首），每行：歌名、原唱、语言：',
    '',
    '晴天｜周杰伦｜中文',
    'ヤキモチ（吃醋）｜高橋優｜日语',
    '光｜陈粒｜中文',
    'if｜西野加奈｜日语',
    'Self｜｜英语',
  ].join('\n');
  expect(mentionPhrases(list)).toEqual(['晴天', 'ヤキモチ', '吃醋', 'Self']);
  expect(mentionPhrases('喂猪\n光\nLemon\n')).toEqual(['喂猪', 'Lemon']);
  expect(mentionIn('主播会唱吃醋吗', list)).toBe('吃醋');
  expect(mentionIn('光好亮', list)).toBeNull();
});

test('{{streamerNames}} is the names joined for text, and escaped alternatives after 主播 for a trigger', () => {
  expect(streamerNamesIn('叫她{{streamerNames}}', ['茜茜', '茜颜'])).toBe('叫她茜茜、茜颜');
  expect(streamerNamesIn('叫她{{streamerNames}}', [])).toBe('叫她主播');
  expect(streamerNamesIn('({{streamerNames}})会', ['a.b'], { pattern: true })).toBe(
    '(主播|a\\.b)会',
  );
  const { commands } = parseCommandIndex(
    {
      x: {
        name: 'x',
        when: '叫{{streamerNames}}',
        prompt: 'p.md',
        trigger: '({{streamerNames}})会',
      },
    },
    { streamerNames: ['虾虾'] },
  );
  expect(commands[0]).toMatchObject({ when: '叫虾虾', trigger: /(主播|虾虾)会/ });
});

/** A room folder and a shared commands folder with a can-sing in it. */
function withShared(index: object) {
  const room = mkdtempSync(join(tmpdir(), 'additional-command-'));
  const commandsDir = mkdtempSync(join(tmpdir(), 'shared-commands-'));
  mkdirSync(join(commandsDir, 'can-sing'));
  writeFileSync(
    join(commandsDir, 'can-sing', 'command.json'),
    JSON.stringify({
      name: '会唱吗',
      when: '在问会不会唱，叫她{{streamerNames}}',
      trigger: '({{streamerNames}})会唱',
      prompt: 'prompt.md',
      price: 0,
      mentions: 'artifacts/songs.txt',
    }),
  );
  writeFileSync(
    join(commandsDir, 'can-sing', 'prompt.md'),
    '共用，{{streamerNames}}，{{file:artifacts/songs.txt}}{{file?:additional_commands/can-sing/notes.md}}',
  );
  mkdirSync(join(room, 'additional_commands', 'can-sing'), { recursive: true });
  mkdirSync(join(room, 'artifacts'));
  writeFileSync(join(room, 'artifacts', 'songs.txt'), '晴天｜周杰伦');
  writeFileSync(join(room, 'additional_commands', 'index.json'), JSON.stringify(index));
  return { room, commandsDir };
}

test("a command with a base is the shared one's fields under the room's, with the shared prompt unless the room has its own", () => {
  const { room, commandsDir } = withShared({
    'can-sing': { base: 'can-sing' },
    pricey: { base: 'can-sing', price: 2, prompt: 'pricey.md' },
    missing: { base: 'nope' },
    sneaky: { base: '../x' },
  });
  writeFileSync(join(room, 'additional_commands', 'pricey.md'), '自己的');
  const log = fakeLog();
  const commands = loadAdditionalCommands(room, {
    log,
    commandsDir,
    streamerNames: () => ['茜茜'],
  });
  expect(commands.map(({ id, price }) => [id, price])).toEqual([
    ['can-sing', 0],
    ['pricey', 2],
  ]);
  expect(commands[0]).toMatchObject({ when: '在问会不会唱，叫她茜茜', trigger: /(主播|茜茜)会唱/ });
  // No notes: the optional file is just left out.
  expect(commands[0]!.prompt()).toBe('共用，茜茜，晴天｜周杰伦');
  writeFileSync(join(room, 'additional_commands', 'can-sing', 'notes.md'), '，备注');
  expect(commands[0]!.prompt()).toBe('共用，茜茜，晴天｜周杰伦，备注');
  expect(commands[1]!.prompt()).toBe('自己的');
  expect(commands[0]!.mentioned!('茜茜会晴天吗')).toBe('晴天');
  expect(log.warn.mock.calls.map(([, meta]) => (meta as { error: string }).error)).toEqual([
    'missing: there is no shared command "nope"',
    'sneaky: base must be the name of a shared command, like "can-sing"',
  ]);
});

test('the live commands are built again when index.json, a shared command or the names change, and kept through a broken index.json', () => {
  const { room, commandsDir } = withShared({ 'can-sing': { base: 'can-sing' } });
  let names = ['茜茜'];
  const log = fakeLog();
  const commands = liveAdditionalCommands(room, { log, commandsDir, streamerNames: () => names });
  const first = commands();
  expect(first.map(({ id }) => id)).toEqual(['can-sing']);
  expect(commands()).toBe(first);

  names = ['虾虾'];
  expect(commands()[0]!.trigger).toEqual(/(主播|虾虾)会唱/);

  const index = join(room, 'additional_commands', 'index.json');
  writeFileSync(index, JSON.stringify({ 'can-sing': { base: 'can-sing', price: 3 } }));
  expect(commands()[0]!.price).toBe(3);

  const shared = join(commandsDir, 'can-sing', 'command.json');
  writeFileSync(shared, JSON.stringify({ name: '新的', when: 'w', prompt: 'prompt.md' }));
  expect(commands()[0]!.name).toBe('新的');

  const good = commands();
  writeFileSync(index, '{ "can-sing": ');
  expect(commands()).toBe(good);
  expect(commands()).toBe(good);
  expect(log.warn).toHaveBeenCalledTimes(1);
});
