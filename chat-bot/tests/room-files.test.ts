import { SETTING_DEFAULTS } from '../src/core/settings';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  livePersona,
  livePrompt,
  liveSection,
  roomConfigFile,
  roomFiles,
  saveStreamer,
  type PersonaChoice,
} from '../src/adapters/room-files';

test('reads one section of a Markdown file, as it is now', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'room-files-')), 'commands.md');
  const commands = liveSection(file, 'The commands');
  expect(commands()).toBe('');

  writeFileSync(
    file,
    '# Commands\n\nIntro\n\n## The commands\n\n/识歌\n\n### /识歌\n\nNames it\n\n## How\n\nInternals\n',
  );
  expect(commands()).toBe('## The commands\n\n/识歌\n\n### /识歌\n\nNames it');

  writeFileSync(file, '## The commands\n\n/回复\n');
  expect(commands()).toBe('## The commands\n\n/回复');
});

test('room_config.json starts not private, and is read again as it changes', () => {
  const { config } = roomFiles(mkdtempSync(join(tmpdir(), 'room-files-')));
  expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({ private: false });
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const file = roomConfigFile(config, { log });
  const roomConfig = () => file.get();
  expect(roomConfig()).toEqual({
    private: false,
    aliases: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    ...SETTING_DEFAULTS,
  });

  writeFileSync(config, '{ "private": true }');
  expect(roomConfig()).toEqual({
    private: true,
    aliases: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    ...SETTING_DEFAULTS,
  });

  writeFileSync(config, '{ "private": "yes" }');
  expect(roomConfig()).toEqual({
    private: true,
    aliases: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    ...SETTING_DEFAULTS,
  });
  expect(log.warn).toHaveBeenCalled();

  writeFileSync(config, '{ "on_sing": { "message": "缇娅 缇娅", "probability": 0.67 } }');
  expect(roomConfig()).toEqual({
    private: false,
    onSing: { message: '缇娅 缇娅', probability: 0.67 },
    aliases: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    ...SETTING_DEFAULTS,
  });

  writeFileSync(config, '{ "on_sing": { "message": "缇娅 缇娅", "probability": "2/3" } }');
  expect(roomConfig()).toEqual({
    private: false,
    onSing: { message: '缇娅 缇娅', probability: 0.67 },
    aliases: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    ...SETTING_DEFAULTS,
  });
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
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
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

  writeFileSync(config, '{ "aliases": ["Fairy", " 菲瑞 ", ""] }');
  expect(roomConfig().aliases).toEqual(['Fairy', '菲瑞']);
  writeFileSync(config, '{ "aliases": "Fairy" }');
  expect(roomConfig().aliases).toEqual(['Fairy', '菲瑞']);
  expect(warned).toEqual(['room_config.json has bad values, keeping their last ones']);
  writeFileSync(config, '{}');
  expect(roomConfig().aliases).toEqual([]);
});

describe('livePersona', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-'));
    const personasDir = join(dir, 'personas');
    mkdirSync(personasDir);
    const roomPersona = join(dir, 'persona.md');
    const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    let choice: PersonaChoice | undefined;
    const persona = livePersona({ roomPersona, personasDir, persona: () => choice, log });
    return {
      personasDir,
      roomPersona,
      log,
      persona,
      choose: (next?: PersonaChoice) => (choice = next),
    };
  };

  test("is the room's persona.md, read as it changes, until the room names a shared persona", () => {
    const { personasDir, roomPersona, persona, choose } = setup();
    expect(persona()).toBe('');
    writeFileSync(roomPersona, '数学课代表\n');
    expect(persona()).toBe('数学课代表');

    writeFileSync(
      join(personasDir, 'fairy.md'),
      'Fairy，{{主播}}的助手\n\n## 说话方式\n\n- 一本正经\n',
    );
    writeFileSync(roomPersona, '## 说话方式\n\n- 正经里带点俏皮\n');
    choose({ base: 'fairy', vars: { 主播: '茜茜' } });
    expect(persona()).toBe('Fairy，茜茜的助手\n\n## 说话方式\n\n- 正经里带点俏皮');

    // An edit to the shared persona applies at once too.
    writeFileSync(join(personasDir, 'fairy.md'), 'Fairy，{{主播}}的首席助手\n');
    expect(persona()).toBe('Fairy，茜茜的首席助手\n\n## 说话方式\n\n- 正经里带点俏皮');
  });

  test("a shared persona that isn't there leaves the room's file alone, warned about once", () => {
    const { roomPersona, log, persona, choose } = setup();
    writeFileSync(roomPersona, '小人机\n');
    choose({ base: 'gone', vars: {} });

    expect(persona()).toBe('小人机');
    expect(persona()).toBe('小人机');
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not read the shared persona'),
      expect.anything(),
    );
  });
});

test("room_config.json's persona names a shared persona and its values; a bad one keeps the last good one", () => {
  const { config } = roomFiles(mkdtempSync(join(tmpdir(), 'room-files-')));
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const file = roomConfigFile(config, { log });
  expect(file.get().persona).toBeUndefined();

  writeFileSync(config, JSON.stringify({ persona: { base: 'fairy', vars: { 主播: '茜茜' } } }));
  expect(file.get().persona).toEqual({ base: 'fairy', vars: { 主播: '茜茜' } });

  writeFileSync(config, JSON.stringify({ persona: { base: '../secret' } }));
  expect(file.get().persona).toEqual({ base: 'fairy', vars: { 主播: '茜茜' } });
  expect(log.warn).toHaveBeenCalledWith(
    'room_config.json has bad values, keeping their last ones',
    {
      problems: [expect.stringContaining('persona.base')],
    },
  );
});
