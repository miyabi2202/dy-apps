import { fillRoomConfig, roomConfigFile } from '../../../src/adapters/files/room-files';
import { AutoReply } from '../../../src/app/replies/auto-reply';
import { settingTool } from '../../../src/app/tools/setting-tool';
import type { Log, SettingsStore } from '../../../src/app/ports';
import { SETTING_DEFAULTS, SETTINGS, settingsFrom } from '../../../src/core/commands/settings';
import { OutOfCreditError } from '../../../src/core/errors';
import { parseCliOptions } from '../../../src/cli-options';
import { ChatHistory } from '../../../src/core/chat/chat-history';
import { fakeNames } from '../../support/fake-names';
import { fakeRoom } from '../../support/fake-room';

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
    '{\n  "private": true,\n  "on_sing": { "message": "加油", "probability": 0.5 },\n  "streamer": { "nickname": "雅", "uid": "7" },\n  "maxReplyParts": 3\n}\n',
  );
  const { log } = recordingLog();
  fillRoomConfig('room_config.json', {}, { log, ...file });

  expect(fileOf(file.state.text)).toEqual({
    private: true,
    on_sing: { message: '加油', probability: 0.5 },
    streamer: { nickname: '雅', uid: '7' },
    aliases: [],
    streamerNames: [],
    focus: [],
    atTrimStart: [],
    timeZone: 'Asia/Shanghai',
    tools: [],
    autoReplyThreshold: 1,
    autoReplyIntervalSeconds: 60,
    autoMessageIntervalSeconds: 0,
    thanksThreshold: 99999,
    autoSongId: false,
    maliceWatch: false,
    happyHeart: false,
    screenshots: false,
    maxReplyParts: 3,
    solveEffort: 'medium',
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
    { autoReplyThreshold: 0.66, thanksThreshold: 500, maxReplyParts: 2, screenshots: true },
    { log, ...file },
  );

  expect(fileOf(file.state.text)).toMatchObject({
    // Not in the file: the option fills it in, else the default.
    maxReplyParts: 2,
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

/** The settings as the features see them, over an in-memory room_config.json. */
function setup(text = '{}') {
  const file = memoryFile(text);
  const recorded = recordingLog();
  fillRoomConfig('room_config.json', {}, { log: recorded.log, ...file });
  const config = roomConfigFile('room_config.json', { log: recorded.log, ...file });
  const store: SettingsStore = { get: () => config.get(), set: (patch) => config.update(patch) };
  return { file, config, store, ...recorded };
}

test('a setting changed by hand takes effect at once, and one a tool changes is written to the file', () => {
  const { file, store } = setup();
  expect(store.get().autoReplyIntervalSeconds).toBe(60);

  // By hand.
  file.state.text = file.state.text.replace(
    '"autoReplyIntervalSeconds": 60',
    '"autoReplyIntervalSeconds": 5',
  );
  expect(store.get().autoReplyIntervalSeconds).toBe(5);

  // By a tool: the file has it, and so does the next read.
  store.set({ autoReplyIntervalSeconds: 20 });
  expect(fileOf(file.state.text).autoReplyIntervalSeconds).toBe(20);
  expect(store.get().autoReplyIntervalSeconds).toBe(20);
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

test('solveEffort is medium or high, anything else keeps the last good one', () => {
  const problems: string[] = [];
  expect(settingsFrom({}).solveEffort).toBe('medium');
  expect(settingsFrom({ solveEffort: 'high' }).solveEffort).toBe('high');
  const last = { ...SETTING_DEFAULTS, solveEffort: 'high' } as const;
  for (const solveEffort of ['max', 1, true]) {
    expect(settingsFrom({ solveEffort }, last, problems).solveEffort).toBe('high');
  }
  expect(problems).toEqual(Array(3).fill('solveEffort must be one of medium, high'));
});

test('a value of the wrong kind keeps the last good settings and is not written', () => {
  const { file, store, messages } = setup();
  file.state.text = file.state.text.replace('"autoSongId": false', '"autoSongId": "yes"');
  expect(store.get().autoSongId).toBe(false);
  expect(messages('room_config.json has bad values, keeping their last ones')).toHaveLength(1);
});

test('the tools keep every setting in the file, and a hand edit counts for all of them', async () => {
  const { file, store, log } = setup();
  const admin = { asker: '雅', question: '', admin: true };
  const tools = {
    autoReplyThreshold: [0.7, settingTool('autoReplyThreshold', { settings: store, log })],
    autoReplyIntervalSeconds: [
      20,
      settingTool('autoReplyIntervalSeconds', { settings: store, log }),
    ],
    autoSongId: [true, settingTool('autoSongId', { settings: store, log })],
    maliceWatch: [true, settingTool('maliceWatch', { settings: store, log })],
    screenshots: [true, settingTool('screenshots', { settings: store, log })],
  } as const;
  for (const [name, [value, tool]] of Object.entries(tools)) {
    const arg = SETTINGS[name as keyof typeof tools].tool!.arg;
    expect(await tool.call({ [arg]: value }, admin)).not.toHaveProperty('isError');
  }
  expect(fileOf(file.state.text)).toMatchObject({
    autoReplyThreshold: 0.7,
    autoReplyIntervalSeconds: 20,
    autoSongId: true,
    maliceWatch: true,
    screenshots: true,
  });

  // A hand edit counts for all of them.
  file.state.text = file.state.text.replace('"maliceWatch": true', '"maliceWatch": false');
  expect(store.get().maliceWatch).toBe(false);
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
    room: fakeRoom({ settings: store, history, now: () => now }),
    names: fakeNames(),
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
  expect(parse('--auto-reply-threshold', '0.66', '--screenshot', '--auto-song-id').given).toEqual({
    autoReplyThreshold: 0.66,
    screenshots: true,
    autoSongId: true,
  });
  expect(parse('--no-screenshot', '--auto-reply-interval', '0').given).toEqual({
    screenshots: false,
    autoReplyIntervalSeconds: 0,
  });
});

test('a bad value in room_config.json keeps that one field as it was, not the whole file', () => {
  const file = memoryFile(
    '{ "private": true, "aliases": [{ "name": "Fairy", "heardAs": [] }], "thanksThreshold": 500 }\n',
  );
  const { log, messages } = recordingLog();
  const config = roomConfigFile('room_config.json', { log, ...file });
  expect(config.get()).toMatchObject({
    private: true,
    aliases: [{ name: 'Fairy', heardAs: [] }],
    thanksThreshold: 500,
  });

  // A hand edit with a string where a number goes: 私密 stays on, the rest stays read.
  file.state.text =
    '{ "private": true, "aliases": [{ "name": "Fairy", "heardAs": [] }, { "name": "菲瑞" }], "thanksThreshold": "600", "autoSongId": true }\n';
  expect(config.get()).toMatchObject({
    private: true,
    aliases: [
      { name: 'Fairy', heardAs: [] },
      { name: '菲瑞', heardAs: [] },
    ],
    thanksThreshold: 500,
    autoSongId: true,
  });
  expect(messages('room_config.json has bad values, keeping their last ones')).toHaveLength(1);
});

test('a command changing a setting while room_config.json is not JSON leaves the file alone', () => {
  const file = memoryFile('{ "private": false,\n');
  const { log, messages } = recordingLog();
  roomConfigFile('room_config.json', { log, ...file }).update({ thanksThreshold: 3 });
  expect(file.state.writes).toBe(0);
  expect(messages('could not change room_config.json')).toHaveLength(1);
});

test('a setting given on the command line that is not a number, 0 or more, is refused', () => {
  const args = ['--room', '416362684969', '--bot-name', '默认关闭'];
  expect(parseCliOptions([...args, '--thanks-threshold', 'abc'], '/pkg')).toBeNull();
  expect(parseCliOptions([...args, '--auto-reply-threshold=-1'], '/pkg')).toBeNull();
  expect(parseCliOptions([...args, '--thanks-threshold', '2'], '/pkg')?.given).toEqual({
    thanksThreshold: 2,
  });
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

test('--max-parts seeds maxReplyParts, which then lives in room_config.json like the others', () => {
  const args = ['--room', '416362684969', '--bot-name', '默认关闭'];
  expect(parseCliOptions([...args, '--max-parts', '2'], '/pkg')?.given).toEqual({
    maxReplyParts: 2,
  });
  expect(parseCliOptions(args, '/pkg')?.given).toEqual({});
});
