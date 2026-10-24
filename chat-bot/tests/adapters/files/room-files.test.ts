import { SETTING_DEFAULTS } from '../../../src/core/commands/settings';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { roomConfigFile, roomFiles, saveStreamer } from '../../../src/adapters/files/room-files';

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
  // Every song break source when absent; the ones listed, or none, when there.
  expect(roomConfig().songBreaks).toBeUndefined();
  writeFileSync(config, '{ "tools": ["can_sing"], "songBreaks": [] }');
  expect(roomConfig().songBreaks).toEqual([]);
  writeFileSync(config, '{ "tools": ["can_sing"], "songBreaks": ["lyrics"] }');
  expect(roomConfig().songBreaks).toEqual(['lyrics']);

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
    streamer: { nickname: '晨曦FM ⁹⁰¹', uid: '7500039236442915865' },
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

test("room_config.json's streamer is read back; a bad one keeps the last good one", () => {
  const { config } = roomFiles(mkdtempSync(join(tmpdir(), 'room-files-')));
  const file = roomConfigFile(config, { log: noLog });

  writeFileSync(config, '{ "streamer": { "nickname": "咿咿", "uid": " 2944953982923360 " } }');
  const streamer = { nickname: '咿咿', uid: '2944953982923360' };
  expect(file.get().streamer).toEqual(streamer);
  writeFileSync(config, '{ "streamer": { "nickname": "咿咿" } }');
  expect(file.get().streamer).toEqual(streamer);
  writeFileSync(config, '{}');
  expect(file.get().streamer).toBeUndefined();
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
