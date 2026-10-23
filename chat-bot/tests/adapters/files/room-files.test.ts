import { SETTING_DEFAULTS } from '../../../src/core/commands/settings';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  livePersona,
  livePrompt,
  roomConfigFile,
  roomFiles,
  saveStreamer,
} from '../../../src/adapters/files/room-files';

test('room_config.json starts not private, and is read again as it changes', () => {
  const { config } = roomFiles(mkdtempSync(join(tmpdir(), 'room-files-')));
  expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({ private: false });
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const file = roomConfigFile(config, { log });
  const roomConfig = () => file.get();
  expect(roomConfig()).toEqual({
    private: false,
    aliases: [],
    streamerNames: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    tools: [],
    ...SETTING_DEFAULTS,
  });

  writeFileSync(config, '{ "private": true }');
  expect(roomConfig()).toEqual({
    private: true,
    aliases: [],
    streamerNames: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    tools: [],
    ...SETTING_DEFAULTS,
  });

  writeFileSync(config, '{ "private": "yes" }');
  expect(roomConfig()).toEqual({
    private: true,
    aliases: [],
    streamerNames: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    tools: [],
    ...SETTING_DEFAULTS,
  });
  expect(log.warn).toHaveBeenCalled();

  writeFileSync(config, '{ "on_sing": { "message": "缇娅 缇娅", "probability": 0.67 } }');
  expect(roomConfig()).toEqual({
    private: false,
    onSing: { message: '缇娅 缇娅', probability: 0.67 },
    aliases: [],
    streamerNames: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    tools: [],
    ...SETTING_DEFAULTS,
  });

  writeFileSync(config, '{ "on_sing": { "message": "缇娅 缇娅", "probability": "2/3" } }');
  expect(roomConfig()).toEqual({
    private: false,
    onSing: { message: '缇娅 缇娅', probability: 0.67 },
    aliases: [],
    streamerNames: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    tools: [],
    ...SETTING_DEFAULTS,
  });

  writeFileSync(config, '{ "tools": ["can_sing"] }');
  expect(roomConfig().tools).toEqual(['can_sing']);

  // A bad list keeps the last good one, with a warning.
  log.warn.mockClear();
  for (const bad of ['"can_sing"', '["Can-Sing"]']) {
    writeFileSync(config, `{ "tools": ${bad} }`);
    expect(roomConfig().tools).toEqual(['can_sing']);
    expect(log.warn).toHaveBeenCalledTimes(1);
    log.warn.mockClear();
  }
});

test('writes the streamer into room_config.json, keeping the rest', () => {
  const { config } = roomFiles(mkdtempSync(join(tmpdir(), 'room-files-')));
  writeFileSync(config, '{ "private": true }');
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  saveStreamer(config, { uid: '7500039236442915865', nickname: '晨曦FM ⁹⁰¹' }, { log });
  expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({
    private: true,
    streamer: { nickname: '晨曦FM ⁹⁰¹', uid: '7500039236442915865' },
  });
  expect(roomConfigFile(config, { log }).get()).toEqual({
    private: true,
    aliases: [],
    streamerNames: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    tools: [],
    ...SETTING_DEFAULTS,
  });

  writeFileSync(config, '{ "private": ');
  saveStreamer(config, { uid: '1', nickname: '阿明' }, { log });
  expect(readFileSync(config, 'utf8')).toBe('{ "private": ');
  expect(log.warn).toHaveBeenCalled();
});

describe('livePrompt', () => {
  const dirs = () => ({
    promptsDir: mkdtempSync(join(tmpdir(), 'prompts-')),
    roomDir: mkdtempSync(join(tmpdir(), 'room-')),
  });

  test("the room's own file, named with underscores, wins over the shared one", () => {
    const { promptsDir, roomDir } = dirs();
    writeFileSync(join(promptsDir, 'song-id.md'), 'shared');
    const prompt = livePrompt('songId', { promptsDir, roomDir });
    expect(prompt()).toBe('shared');

    writeFileSync(join(roomDir, 'song_id.md'), 'room');
    expect(prompt()).toBe('room');

    rmSync(join(roomDir, 'song_id.md'));
    expect(prompt()).toBe('shared');
  });

  test('edits to the shared file are picked up', () => {
    const { promptsDir, roomDir } = dirs();
    writeFileSync(join(promptsDir, 'gift-thanks.md'), 'one');
    const prompt = livePrompt('giftThanks', { promptsDir, roomDir });
    writeFileSync(join(promptsDir, 'gift-thanks.md'), 'two');
    expect(prompt()).toBe('two');
  });

  test('a prompt without roomDir ignores room files, and sharedPath replaces the shared file', () => {
    const { promptsDir, roomDir } = dirs();
    writeFileSync(join(promptsDir, 'prompt.md'), 'shared');
    writeFileSync(join(roomDir, 'prompt.md'), 'room');
    writeFileSync(join(roomDir, 'mine.md'), 'mine');
    expect(livePrompt('mention', { promptsDir })()).toBe('shared');
    expect(livePrompt('mention', { promptsDir, sharedPath: join(roomDir, 'mine.md') })()).toBe(
      'mine',
    );
  });

  test('the shared file read at the start is used if it can no longer be read', () => {
    const { promptsDir, roomDir } = dirs();
    writeFileSync(join(promptsDir, 'song-intro.md'), 'first');
    const prompt = livePrompt('songIntro', { promptsDir, roomDir });
    rmSync(join(promptsDir, 'song-intro.md'));
    expect(prompt()).toBe('first');
  });

  test('a missing shared file throws at construction', () => {
    const { promptsDir, roomDir } = dirs();
    expect(() => livePrompt('replyPick', { promptsDir, roomDir })).toThrow();
  });
});

const noLog = { debug() {}, info() {}, warn() {}, error() {} };

test("room_config.json's aliases are the other names of the bot, read again as they change", () => {
  const { config } = roomFiles(mkdtempSync(join(tmpdir(), 'room-files-')));
  const warned: string[] = [];
  const log = { ...noLog, warn: (message: string) => void warned.push(message) };
  const file = roomConfigFile(config, { log });
  const roomConfig = () => file.get();

  // A name, or a name with how speech recognition writes it besides.
  writeFileSync(
    config,
    '{ "aliases": [{ "name": "Fairy", "heardAs": [" ferry ", ""] }, { "name": " 菲瑞 ", "heardAs": [] }, { "name": "" }, { "name": "小F" }] }',
  );
  const fairy = [
    { name: 'Fairy', heardAs: ['ferry'] },
    { name: '菲瑞', heardAs: [] },
    { name: '小F', heardAs: [] },
  ];
  expect(roomConfig().aliases).toEqual(fairy);
  writeFileSync(config, '{ "aliases": "Fairy" }');
  expect(roomConfig().aliases).toEqual(fairy);
  // A plain name is the old way: it must say its heardAs now.
  writeFileSync(config, '{ "aliases": ["Fairy"] }');
  expect(roomConfig().aliases).toEqual(fairy);
  writeFileSync(config, '{ "aliases": [{ "name": "Fairy", "heardAs": "ferry" }] }');
  expect(roomConfig().aliases).toEqual(fairy);
  expect(warned).toEqual(Array(3).fill('room_config.json has bad values, keeping their last ones'));
  writeFileSync(config, '{}');
  expect(roomConfig().aliases).toEqual([]);
  writeFileSync(config, '{ "streamerNames": ["茜茜", " 茜颜 "] }');
  expect(roomConfig().streamerNames).toEqual(['茜茜', '茜颜']);
});

describe('livePersona', () => {
  const setup = () => {
    const roomDir = mkdtempSync(join(tmpdir(), 'room-'));
    const sharedDir = mkdtempSync(join(tmpdir(), 'shared-'));
    mkdirSync(join(roomDir, 'personas'));
    const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    let file: string | undefined;
    const persona = livePersona({ roomDir, sharedDir, file: () => file, log });
    return { roomDir, sharedDir, log, persona, choose: (next?: string) => (file = next) };
  };

  test('plays the file room_config.json names, read as it changes; switching is naming another', () => {
    const { roomDir, persona, choose } = setup();
    expect(persona()).toBe('');
    writeFileSync(join(roomDir, 'personas', '课代表.md'), '数学课代表\n');
    writeFileSync(join(roomDir, 'personas', '小猫.md'), '小猫\n');
    choose('personas/课代表.md');
    expect(persona()).toBe('数学课代表');

    writeFileSync(join(roomDir, 'personas', '课代表.md'), '嘴毒的数学课代表\n');
    expect(persona()).toBe('嘴毒的数学课代表');
    choose('personas/小猫.md');
    expect(persona()).toBe('小猫');
  });

  test('a file with a base header is changes to that shared persona, its blanks filled from the header', () => {
    const { roomDir, sharedDir, persona, choose } = setup();
    writeFileSync(
      join(sharedDir, 'fairy.md'),
      'Fairy，{{主播}}的助手\n\n## 说话方式\n\n- 一本正经\n',
    );
    writeFileSync(
      join(roomDir, 'personas', 'fairy.md'),
      '---\nbase: fairy\n主播: 咿咿\n---\n## 说话方式\n\n- 正经里带点俏皮\n',
    );
    choose('personas/fairy.md');
    expect(persona()).toBe('Fairy，咿咿的助手\n\n## 说话方式\n\n- 正经里带点俏皮');

    // An edit to the shared persona applies at once too.
    writeFileSync(join(sharedDir, 'fairy.md'), 'Fairy，{{主播}}的首席助手\n');
    expect(persona()).toBe('Fairy，咿咿的首席助手\n\n## 说话方式\n\n- 正经里带点俏皮');
  });

  test("what it can't read is warned about once, and the bot plays what is left", () => {
    const { roomDir, log, persona, choose } = setup();
    choose('personas/gone.md');
    expect(persona()).toBe('');
    writeFileSync(join(roomDir, 'personas', 'mine.md'), '---\nbase: nowhere\n---\n小人机\n');
    choose('personas/mine.md');
    expect(persona()).toBe('小人机');
    expect(persona()).toBe('小人机');

    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not read the persona file'),
      expect.anything(),
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not read the shared persona'),
      expect.anything(),
    );
  });
});

test("room_config.json's persona is a file in the room's folder; one outside it keeps the last good one", () => {
  const { config } = roomFiles(mkdtempSync(join(tmpdir(), 'room-files-')));
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const file = roomConfigFile(config, { log });
  expect(file.get().persona).toBeUndefined();

  writeFileSync(config, JSON.stringify({ persona: 'personas/fairy.md' }));
  expect(file.get().persona).toBe('personas/fairy.md');

  writeFileSync(config, JSON.stringify({ persona: '../other/personas/fairy.md' }));
  expect(file.get().persona).toBe('personas/fairy.md');
  expect(log.warn).toHaveBeenCalledWith(
    'room_config.json has bad values, keeping their last ones',
    {
      problems: [expect.stringContaining('persona')],
    },
  );
});
