import { fillRoomConfig, roomConfigFile } from '../src/adapters/room-files';
import { AutoReply } from '../src/app/auto-reply';
import { Billing } from '../src/app/billing';
import { AutoSongId } from '../src/app/auto-song-id';
import { MaliceWatch } from '../src/app/malice-watch';
import type { Log, SettingsStore } from '../src/app/ports';
import { OutOfCreditError } from '../src/core/errors';
import { SETTING_DEFAULTS } from '../src/core/settings';
import { parseCliOptions } from '../src/cli-options';
import { ChatHistory } from '../src/core/chat-history';
import { fakeRoom } from './fake-room';
import { memoryWallet } from './fakes';

/** A room_config.json in memory, and everything written to it. */
function memoryFile(text: string) {
  const state = { text, writes: 0 };
  return {
    state,
    read: () => state.text,
    write: (_path: string, next: string) => {
      state.text = next;
      state.writes++;
    },
  };
}

/** A log that remembers what it was told, by level. */
function recordingLog() {
  const told: { level: string; message: string; meta: unknown }[] = [];
  const at = (level: string) => (message: string, meta?: object) =>
    void told.push({ level, message, meta });
  const log: Log = { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
  return { log, told, messages: (message: string) => told.filter((t) => t.message === message) };
}

const fileOf = (text: string) => JSON.parse(text) as Record<string, unknown>;

test('fills in the fields a room_config.json lacks with their defaults, and keeps all the others as they are', () => {
  const file = memoryFile(
    '{\n  "private": true,\n  "on_sing": { "message": "加油", "probability": 0.5 },\n  "streamer": { "nickname": "雅", "uid": "7" },\n  "mentionCost": 3\n}\n',
  );
  const { log } = recordingLog();
  fillRoomConfig('room_config.json', {}, { log, ...file });

  expect(fileOf(file.state.text)).toEqual({
    private: true,
    on_sing: { message: '加油', probability: 0.5 },
    streamer: { nickname: '雅', uid: '7' },
    mentionCost: 3,
    aliases: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    autoReplyThreshold: 1,
    autoReplyIntervalSeconds: 60,
    thanksThreshold: 99999,
    autoSongId: false,
    maliceWatch: false,
    screenshots: false,
  });
  // Stable formatting: 2 spaces, a trailing newline, the existing fields first.
  expect(file.state.text.endsWith('}\n')).toBe(true);
  expect(file.state.text.startsWith('{\n  "private": true,\n  "on_sing"')).toBe(true);

  // Complete now: another start doesn't touch it.
  fillRoomConfig('room_config.json', {}, { log, ...file });
  expect(file.state.writes).toBe(1);
});

test('an option given at start fills in a missing field, but what the file has wins, with a warning', () => {
  const file = memoryFile('{ "autoReplyThreshold": 0.8, "thanksThreshold": 500 }');
  const { log, messages } = recordingLog();
  fillRoomConfig(
    'room_config.json',
    { autoReplyThreshold: 0.66, thanksThreshold: 500, mentionCost: 2, screenshots: true },
    { log, ...file },
  );

  expect(fileOf(file.state.text)).toMatchObject({
    // Not in the file: the option fills it in, else the default.
    mentionCost: 2,
    screenshots: true,
    autoSongId: false,
    // In the file: kept.
    autoReplyThreshold: 0.8,
    thanksThreshold: 500,
  });
  // Only an option that differs is worth a warning.
  expect(messages('setting from room_config, ignoring option').map((t) => t.meta)).toEqual([
    { field: 'autoReplyThreshold', config: 0.8, option: 0.66 },
  ]);
});

test('a room_config.json that is not JSON is left alone', () => {
  const file = memoryFile('{ not json');
  const { log, messages } = recordingLog();
  fillRoomConfig('room_config.json', {}, { log, ...file });

  expect(file.state.text).toBe('{ not json');
  expect(file.state.writes).toBe(0);
  expect(messages('could not fill in room_config.json')).toHaveLength(1);
});

test('a 私密 room stays one: private is kept, and the settings are filled in beside it', () => {
  const file = memoryFile('{ "private": true }');
  const { log } = recordingLog();
  fillRoomConfig('room_config.json', {}, { log, ...file });
  const config = roomConfigFile('room_config.json', { log, ...file }).get();

  expect(config).toMatchObject({ private: true, ...SETTING_DEFAULTS });
});

/** The settings as the features see them, over an in-memory room_config.json. */
function setup(text = '{}') {
  const file = memoryFile(text);
  const recorded = recordingLog();
  fillRoomConfig('room_config.json', {}, { log: recorded.log, ...file });
  const config = roomConfigFile('room_config.json', { log: recorded.log, ...file });
  const store: SettingsStore = { get: () => config.get(), set: (patch) => config.update(patch) };
  return { file, config, store, ...recorded };
}

test('a setting changed by hand takes effect at once, and one changed by a command is written to the file', () => {
  const { file, store } = setup();
  const billing = new Billing({ wallet: memoryWallet(), settings: store });
  expect(billing.cost).toBe(0);

  // By hand.
  file.state.text = file.state.text.replace('"mentionCost": 0', '"mentionCost": 5');
  expect(billing.cost).toBe(5);

  // By command: the file has it, and so does the next read.
  const command = billing.commands().find((c) => c.name === '修改收费');
  expect(command?.run?.('2')).toEqual({ ok: true, reply: '已处理修改收费请求' });
  expect(fileOf(file.state.text).mentionCost).toBe(2);
  expect(billing.cost).toBe(2);
  expect(command?.run?.('很多')).toEqual({
    ok: false,
    reply: '收费要写成钻石数，用法：/修改收费 2',
  });
  expect(fileOf(file.state.text).mentionCost).toBe(2);
});

test('writing a setting does not make the file reload: one read after it, and no write by the read', () => {
  const { file, store, messages, config } = setup();
  const before = messages('room config').length;
  store.set({ autoReplyThreshold: 0.6 });
  expect(messages('room config')).toHaveLength(before + 1);
  const writes = file.state.writes;

  // Reading it as often as the features do changes nothing and writes nothing.
  for (let i = 0; i < 5; i++) expect(config.get().autoReplyThreshold).toBe(0.6);
  expect(messages('room config')).toHaveLength(before + 1);
  expect(file.state.writes).toBe(writes);
});

test('keeps what else the file has, unknown fields and the streamer included, when a setting is written', () => {
  const { file, store } = setup(
    '{ "download": [], "streamer": { "nickname": "雅", "uid": "7" }, "extra": 1 }',
  );
  store.set({ screenshots: true });

  expect(fileOf(file.state.text)).toMatchObject({
    download: [],
    streamer: { nickname: '雅', uid: '7' },
    extra: 1,
    screenshots: true,
  });
});

test('a value of the wrong kind keeps the last good settings and is not written', () => {
  const { file, store, messages } = setup();
  file.state.text = file.state.text.replace('"autoSongId": false', '"autoSongId": "yes"');
  expect(store.get().autoSongId).toBe(false);
  expect(messages('room_config.json has bad values, keeping their last ones')).toHaveLength(1);
});

test('auto-reply, the thanker, auto song id, malice watch and the screenshots keep their settings in the file', () => {
  const { file, store } = setup();
  const room = fakeRoom({ settings: store });
  const autoReply = new AutoReply({
    outbox: { push: () => {} },
    threshold: 1,
    room,
    log: { debug() {}, info() {}, warn() {}, error() {} },
    picker: () => Promise.resolve('{}'),
    pickTemplate: () => '',
    reply: () => {},
    streamer: () => null,
    settings: store,
  });
  const run = (
    commands: { name: string; run?: (args: string) => unknown }[],
    name: string,
    args: string,
  ) => commands.find((c) => c.name === name)?.run?.(args);

  run(autoReply.commands(), '自动回复阈值', '0.7');
  run(autoReply.commands(), '自动回复间隔', '20');
  expect(fileOf(file.state.text)).toMatchObject({
    autoReplyThreshold: 0.7,
    autoReplyIntervalSeconds: 20,
  });
  expect(autoReply.quietMs).toBe(20_000);

  const auto = new AutoSongId({
    songId: {
      prompt: () => '',
      name: () => Promise.reject(new Error('no')),
      namedAt: () => undefined,
      lastTold: () => undefined,
      told: () => {},
    },
    room,
    outbox: { push: () => {} },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: store,
  });
  run(auto.commands(), '自动识歌', '1');
  expect(auto.on).toBe(true);
  expect(fileOf(file.state.text).autoSongId).toBe(true);

  const watch = new MaliceWatch({
    judge: () => Promise.resolve({}),
    ask: () => Promise.resolve('{}'),
    promptTemplate: () => '',
    outbox: { push: () => {} },
    room,
    log: { debug() {}, info() {}, warn() {}, error() {} },
    settings: store,
  });
  run(watch.commands(), '识别恶意言论', '1');
  expect(fileOf(file.state.text).maliceWatch).toBe(true);

  room.screenshots = true;
  expect(fileOf(file.state.text).screenshots).toBe(true);
  // A hand edit counts for all of them.
  file.state.text = file.state.text.replace('"maliceWatch": true', '"maliceWatch": false');
  expect(watch.on).toBe(false);
});

test('when Jev runs out of money, auto-reply is turned off in the file too', async () => {
  const { file, store } = setup('{ "autoReplyThreshold": 0.6 }');
  const history = new ChatHistory(10);
  const sent: unknown[] = [];
  let now = 0;
  let rounds = 0;
  const autoReply: AutoReply = new AutoReply({
    outbox: { push: (m) => void sent.push(m) },
    judge: () => Promise.reject(new OutOfCreditError('no money')),
    threshold: 1,
    room: fakeRoom({ settings: store, history, now: () => now }),
    log: { debug() {}, info() {}, warn() {}, error() {} },
    picker: () => Promise.resolve('{}'),
    pickTemplate: () => '',
    reply: () => {},
    streamer: () => null,
    settings: store,
    sleep: () => {
      now += 20_000;
      if (rounds++ === 0)
        history.add({ ts: now, userId: 'u-1', nickname: '阿明', content: '机器人在吗' });
      else autoReply.stop();
      return Promise.resolve();
    },
  });
  await autoReply.run();

  expect(sent).toEqual([{ kind: 'system', text: '钱包烧干了，自动回复已关闭' }]);
  expect(fileOf(file.state.text).autoReplyThreshold).toBe(10);
});

test('the command line says which settings it gave, and the rest stay the room’s own', () => {
  const parse = (...args: string[]) =>
    parseCliOptions(['--room', '123', '--bot-name', 'x', ...args], '/pkg')!;

  expect(parse().given).toEqual({});
  expect(parse().autoReplyThreshold).toBe(1);
  expect(
    parse('--auto-reply-threshold', '0.66', '--cost', '2', '--screenshot', '--auto-song-id').given,
  ).toEqual({ autoReplyThreshold: 0.66, mentionCost: 2, screenshots: true, autoSongId: true });
  expect(parse('--test').given).toEqual({ mentionCost: 0 });
  expect(parse('--no-screenshot', '--auto-reply-interval', '0').given).toEqual({
    screenshots: false,
    autoReplyIntervalSeconds: 0,
  });
});

test('a bad value in room_config.json keeps that one field as it was, not the whole file', () => {
  const file = memoryFile('{ "private": true, "aliases": ["Fairy"], "mentionCost": 5 }\n');
  const { log, messages } = recordingLog();
  const config = roomConfigFile('room_config.json', { log, ...file });
  expect(config.get()).toMatchObject({ private: true, aliases: ['Fairy'], mentionCost: 5 });

  // A hand edit with a string where a number goes: 私密 stays on, the rest stays read.
  file.state.text =
    '{ "private": true, "aliases": ["Fairy", "菲瑞"], "mentionCost": "6", "autoSongId": true }\n';
  expect(config.get()).toMatchObject({
    private: true,
    aliases: ['Fairy', '菲瑞'],
    mentionCost: 5,
    autoSongId: true,
  });
  expect(messages('room_config.json has bad values, keeping their last ones')).toHaveLength(1);
});

test('a command changing a setting while room_config.json is not JSON leaves the file alone', () => {
  const file = memoryFile('{ "private": false,\n');
  const { log, messages } = recordingLog();
  roomConfigFile('room_config.json', { log, ...file }).update({ mentionCost: 3 });
  expect(file.state.writes).toBe(0);
  expect(messages('could not change room_config.json')).toHaveLength(1);
});

test('a setting given on the command line that is not a number, 0 or more, is refused', () => {
  const args = ['--room', '416362684969', '--bot-name', '默认关闭'];
  expect(parseCliOptions([...args, '--cost', 'abc'], '/pkg')).toBeNull();
  expect(parseCliOptions([...args, '--auto-reply-threshold=-1'], '/pkg')).toBeNull();
  expect(parseCliOptions([...args, '--cost', '2'], '/pkg')?.given).toEqual({ mentionCost: 2 });
});

test('room_config.json says where the streamer is: Beijing time when it does not, a bad zone kept as it was', () => {
  const file = memoryFile('{ "timeZone": "Asia/Tokyo" }\n');
  const { log, messages } = recordingLog();
  const config = roomConfigFile('room_config.json', { log, ...file });
  expect(config.get().timeZone).toBe('Asia/Tokyo');
  file.state.text = '{ "timeZone": "Mars/Olympus" }\n';
  expect(config.get().timeZone).toBe('Asia/Tokyo');
  expect(messages('room_config.json has bad values, keeping their last ones')).toHaveLength(1);
  file.state.text = '{}\n';
  expect(config.get().timeZone).toBe('Asia/Shanghai');
});
