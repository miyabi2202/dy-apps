import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CodexCliOptions } from '../src/adapters/codex-cli';
import type { AskModel, Log, Question, SpawnWorker } from '../src/app/ports';
import { parseCliOptions } from '../src/cli-options';
import { buildContainer } from '../src/wiring';
import {
  APP,
  BILLING,
  AUTO_SONG_ID,
  BOT,
  CLAUDE_CLI,
  CODEX_CLI,
  COMMANDS,
  DOWNLOADS,
  JEV_CLIENT,
  LYRICS_SEARCH,
  MALICE_WATCH,
  MCP_SERVER,
  OUTBOX,
  ROOM_API,
  ROOM_EVENTS,
  SONG_ID,
  SPAWN_WORKER,
  TRANSCRIBER,
  WALLET_STORAGE,
} from '../src/wiring/tokens';
import { chat, fakeEvents } from './fakes';

const PACKAGE_DIR = join(__dirname, '..');

/**
 * The whole bot built by the container, with the outside world (room-feed, Claude, Codex, Jev, the
 * speech worker) swapped for fakes, for the options `args` and the environment `env`.
 */
function build(args: string[] = [], env: { JEV_API_KEY?: string } = { JEV_API_KEY: 'key' }) {
  const dir = mkdtempSync(join(tmpdir(), 'chat-bot-wiring-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ admins: ['7001'], adminNames: '雅' }));
  const options = parseCliOptions(
    [
      ...['--room', '123', '--bot-name', '小助手', '--bot-id', 'bot-1', '--send-interval', '0'],
      ...['--data', join(dir, 'data'), '--logs', dir, '--config', join(dir, 'config.json')],
      // No real server on a real port, unless a test asks for it with --mcp.
      '--no-mcp',
      ...args,
    ],
    PACKAGE_DIR,
  )!;
  const logged: [string, string][] = [];
  const log: Log = {
    debug() {},
    info: (message) => void logged.push(['info', message]),
    warn: (message) => void logged.push(['warn', message]),
    error: (message) => void logged.push(['error', message]),
  };
  const container = buildContainer({ options, packageDir: PACKAGE_DIR, log, env });

  const sent: string[] = [];
  const prompts: string[] = [];
  const { events, say } = fakeEvents();
  let connected = 0;
  const spawned: string[] = [];
  const codexMade: CodexCliOptions[] = [];
  const jevKeys: string[] = [];
  let claudeAnswer: (question: Question) => string = () => '你好呀';
  const claude: AskModel = (question) => {
    prompts.push(question.prompt);
    return Promise.resolve(claudeAnswer(question));
  };
  let ready: () => void = () => {};
  const spawnWorker: SpawnWorker = ({ onLine }) => {
    spawned.push('worker');
    let exit: (code: number) => void = () => {};
    ready = () => onLine(JSON.stringify({ ready: true }));
    return {
      kill: () => exit(0),
      send: () => {},
      exited: new Promise((resolve) => (exit = resolve)),
    };
  };
  container
    .register(ROOM_API, () => ({
      sendChat: (text: string) => {
        sent.push(text);
        return Promise.resolve({ echoed: true });
      },
      streamUrl: () => Promise.resolve('https://stream/live.flv'),
      streamer: () => Promise.resolve(null),
      screenshot: () => Promise.resolve(new Uint8Array()),
    }))
    .register(ROOM_EVENTS, () => ({ ...events, connect: () => void connected++ }))
    .register(SPAWN_WORKER, () => spawnWorker)
    .register(WALLET_STORAGE, () => ({ load: () => ({ accounts: {} }), save: () => {} }))
    .register(CLAUDE_CLI, () => claude)
    .register(CODEX_CLI, () => (over) => {
      codexMade.push(over);
      return () => Promise.resolve('{}');
    })
    .register(JEV_CLIENT, () => (apiKey) => {
      jevKeys.push(apiKey);
      return () => Promise.resolve({});
    })
    .register(
      LYRICS_SEARCH,
      () => () =>
        Promise.resolve({
          title: '',
          sure: false,
          candidates: [],
          why: 'a test',
          queries: [],
          ms: 0,
        }),
    )
    .register(DOWNLOADS, () => () => {});
  return {
    container,
    dir,
    logged,
    sent,
    prompts,
    say,
    spawned,
    codexMade,
    jevKeys,
    connected: () => connected,
    workerReady: () => ready(),
    answerWith: (answer: (question: Question) => string) => (claudeAnswer = answer),
    commands: () => container.resolve(COMMANDS).map((command) => command.name),
  };
}

const ALL_COMMANDS = [
  '修改收费',
  '自动回复阈值',
  '自动回复间隔',
  '最大回复条数',
  '自动谢礼',
  '截图',
  '识歌',
  '解题',
  '拼命解题',
  '自动识歌',
  '识别恶意言论',
  '识别背景音乐',
];

// Starting runs the auto-reply loop, which waits on a real timer that no one stops after the test.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

const mention = (nickname: string, userId: string, content: string) => ({
  ...chat(nickname, content, [{ text: '@小助手', userId: 'bot-1' }]),
  userId,
});

test('by default it has every feature, each with its own command in the order the help shows', () => {
  const bot = build();
  bot.container.resolve(APP);

  expect(bot.commands()).toEqual(ALL_COMMANDS);
  expect(bot.container.resolve(SONG_ID)).not.toBeNull();
  expect(bot.container.resolve(AUTO_SONG_ID)).not.toBeNull();
  expect(bot.container.resolve(MALICE_WATCH)).not.toBeNull();
  expect(bot.container.resolve(TRANSCRIBER)).not.toBeNull();
  expect(bot.jevKeys).toEqual(['key']);
  // Codex for the picker, the song id and malice watch, and gpt-6-astra for the two solve commands.
  const models = bot.codexMade.map((over) => over.model);
  expect(models.filter((model) => model === undefined)).toHaveLength(3);
  expect(models.filter((model) => model === 'gpt-6-astra')).toHaveLength(2);
});

test("--codex '' leaves out /识歌, the auto-reply picker and everything that needs Codex, but not /解题", () => {
  const bot = build(['--codex', '']);
  bot.container.resolve(APP);

  expect(bot.commands()).toEqual(
    ALL_COMMANDS.filter((name) => !['识歌', '自动识歌', '识别恶意言论'].includes(name)),
  );
  expect(bot.container.resolve(SONG_ID)).toBeNull();
  expect(bot.container.resolve(AUTO_SONG_ID)).toBeNull();
  expect(bot.container.resolve(MALICE_WATCH)).toBeNull();
  // Jev is never made, and Codex only for /解题 (always gpt-6-astra).
  expect(bot.jevKeys).toEqual([]);
  expect(bot.codexMade.map((over) => over.model)).toEqual(['gpt-6-astra', 'gpt-6-astra']);
  expect(bot.logged).toContainEqual([
    'warn',
    '--codex is empty: auto-reply is off, the bot only talks when @ed',
  ]);
});

test('--no-asr has no transcriber, no /识别背景音乐 and no auto song id, and starts no worker', async () => {
  const bot = build(['--no-asr']);
  const app = bot.container.resolve(APP);
  await app.start();
  app.stop();

  expect(bot.container.resolve(TRANSCRIBER)).toBeNull();
  expect(bot.container.resolve(AUTO_SONG_ID)).toBeNull();
  expect(bot.commands()).toEqual(
    ALL_COMMANDS.filter((name) => !['自动识歌', '识别背景音乐'].includes(name)),
  );
  expect(bot.spawned).toEqual([]);
  expect(bot.connected()).toBe(1);
});

test('without a JEV_API_KEY there is no Jev, so no auto-reply and no malice watch', () => {
  const bot = build([], {});
  bot.container.resolve(APP);

  expect(bot.jevKeys).toEqual([]);
  expect(bot.container.resolve(MALICE_WATCH)).toBeNull();
  expect(bot.commands()).not.toContain('识别恶意言论');
  expect(bot.logged).toContainEqual([
    'warn',
    'no JEV_API_KEY in chat-bot/.env: auto-reply is off, the bot only talks when @ed',
  ]);
});

test('starts the speech worker first and enters the room once its models are loaded', async () => {
  {
    const bot = build();
    const app = bot.container.resolve(APP);
    const started = app.start();
    await Promise.resolve();

    expect(bot.spawned).toEqual(['worker']);
    expect(bot.connected()).toBe(0);
    bot.workerReady();
    await started;
    expect(bot.connected()).toBe(1);
    app.stop();
    expect(bot.logged.map(([, message]) => message)).toEqual(
      expect.arrayContaining(['starting', 'stopping']),
    );
  }
});

test('a start stopped while the models load never enters the room', async () => {
  {
    const bot = build();
    const app = bot.container.resolve(APP);
    const started = app.start();
    await Promise.resolve();
    app.stop();
    await started;

    expect(bot.connected()).toBe(0);
  }
});

test('answers a mention with the room, the settings the features gave and the persona in the prompt', async () => {
  const bot = build(['--no-asr', '--codex', '']);
  const app = bot.container.resolve(APP);
  await app.start();
  bot.say(mention('小红', 'u-1', '@小助手 你好'));
  await bot.container.resolve(BOT).idle();
  await bot.container.resolve(OUTBOX).idle();
  app.stop();

  expect(bot.sent).toEqual(['@小红 你好呀']);
  const prompt = bot.prompts[0]!;
  expect(prompt).toContain('小红 @ 了你：你好');
  // Every feature's part of the settings, even those that are off.
  expect(prompt).toContain('- 每次 @ 你：免费');
  expect(prompt).toContain('- 自动回复：关闭');
  expect(prompt).toContain('- 自动谢礼：关闭');
  expect(prompt).toContain('- 自动识歌：关闭');
});

test('a command asked for in words runs through the bot, which the answerer reaches only when it answers', async () => {
  const bot = build(['--no-asr', '--codex', '']);
  const app = bot.container.resolve(APP);
  await app.start();
  bot.answerWith(() =>
    JSON.stringify({
      message: '好的',
      others: [],
      command_request: '修改收费',
      command_args: '2',
    }),
  );
  bot.say(mention('雅', '7001', '@小助手 以后每次收 2 钻'));
  await bot.container.resolve(BOT).idle();
  await bot.container.resolve(OUTBOX).idle();
  app.stop();

  expect(bot.sent).toEqual(['@雅 已处理修改收费请求']);
  const config = readFileSync(join(bot.dir, 'data', '123', 'room_config.json'), 'utf8');
  expect(JSON.parse(config)).toMatchObject({ mentionCost: 2 });
});

test("starts filling in the room's room_config.json: an option seeds a missing setting, and what the file has wins", () => {
  const first = build(['--no-asr', '--cost', '2']);
  first.container.resolve(APP);
  const path = join(first.dir, 'data', '123', 'room_config.json');
  expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
    private: false,
    aliases: [],
    mentionCost: 2,
    autoReplyThreshold: 1,
  });

  // The next start, with another option: the file's value stays, with a warning.
  const options = parseCliOptions(
    ['--room', '123', '--bot-name', '小助手', '--data', join(first.dir, 'data'), '--cost', '9'],
    PACKAGE_DIR,
  )!;
  const warned: string[] = [];
  const container = buildContainer({
    options,
    packageDir: PACKAGE_DIR,
    log: { debug() {}, info() {}, error() {}, warn: (message) => void warned.push(message) },
    env: {},
  });
  container.register(DOWNLOADS, () => () => {});
  container.resolve(BILLING);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ mentionCost: 2 });
  expect(container.resolve(BILLING).cost).toBe(2);
  expect(warned).toContain('setting from room_config, ignoring option');
});

test('the bot has identify_song and identify_bgm for Claude by default, and none without --mcp or without listening', () => {
  const tools = (bot: ReturnType<typeof build>) =>
    bot.container.resolve(MCP_SERVER)?.open({ asker: 'a', question: '' });
  const withMcp = build(['--mcp']);
  // Not started, so it hands out no session; what it offers is what it was built with.
  expect(withMcp.container.resolve(MCP_SERVER)).not.toBeNull();
  expect(tools(withMcp)).toBeNull();
  expect(build().container.resolve(MCP_SERVER)).toBeNull();
  // Without listening there is no song id to ask and no music to hear: no tools at all.
  expect(build(['--mcp', '--no-asr']).container.resolve(MCP_SERVER)).toBeNull();
});

test('the tools server starts with the bot, serves identify_song and identify_bgm, and stops with it', async () => {
  const bot = build(['--mcp', '--mcp-port', '0']);
  const app = bot.container.resolve(APP);
  const started = app.start();
  await Promise.resolve();
  bot.workerReady();
  await started;
  const session = bot.container.resolve(MCP_SERVER)!.open({ asker: 'a', question: '' })!;
  expect(session.access.tools).toEqual(['identify_song', 'identify_bgm']);
  app.stop();
  await jest
    .requireActual<typeof import('node:timers/promises')>('node:timers/promises')
    .setImmediate();
  expect(bot.container.resolve(MCP_SERVER)!.open({ asker: 'a', question: '' })).toBeNull();
});
