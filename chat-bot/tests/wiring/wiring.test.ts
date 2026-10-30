import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CodexCliOptions } from '../../src/adapters/models/codex-cli';
import type { AskModel, Log, Question, SpawnWorker } from '../../src/app/ports';
import { loadToolDefinitions } from '../../src/adapters/files/tool-files';
import { parseCliOptions } from '../../src/cli-options';
import { buildContainer } from '../../src/wiring';
import {
  APP,
  AUTO_SONG_ID,
  BOT,
  CLAUDE_CLI,
  CODEX_CLI,
  DOWNLOADS,
  JEV_CLIENT,
  LYRICS_SEARCH,
  MALICE_WATCH,
  MCP_SERVER,
  OUTBOX,
  ROOM_API,
  ROOM_EVENTS,
  SONG_BREAK_SOURCES,
  SONG_ID,
  SPAWN_WORKER,
  THANKER,
  TOOLS,
  TRANSCRIBER,
} from '../../src/wiring/tokens';
import { chat, fakeEvents } from '../support/fakes';

const PACKAGE_DIR = join(__dirname, '..', '..');

/**
 * The whole bot built by the container, with the outside world (room-feed, Claude, Codex, Jev, the
 * speech worker) swapped for fakes, for the options `args` and the environment `env`.
 */
function build(
  args: string[] = [],
  env: { JEV_API_KEY?: string } = { JEV_API_KEY: 'key' },
  /** Files to put in the room's folder (`data/123/`) first, by path in it. */
  roomFiles: Record<string, string> = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'chat-bot-wiring-'));
  for (const [path, text] of Object.entries(roomFiles)) {
    mkdirSync(dirname(join(dir, 'data', '123', path)), { recursive: true });
    writeFileSync(join(dir, 'data', '123', path), text);
  }
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ admins: ['7001'], adminNames: '雅' }));
  const options = parseCliOptions(
    [
      ...['--room', '123', '--bot-name', '小助手', '--bot-id', 'bot-1', '--send-interval', '0'],
      ...['--data', join(dir, 'data'), '--logs', dir, '--config', join(dir, 'config.json')],
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
      like: (likes: number) =>
        Promise.resolve({ liked: likes, heldMs: likes * 200, tooFast: false }),
      sendFansLamp: () => Promise.resolve({ result: 'sent' as const }),
      sendHeart: () => Promise.resolve({ result: 'sent' as const, diamondsLeft: 10 }),
      streamUrl: () => Promise.resolve('https://stream/live.flv'),
      streamer: () => Promise.resolve(null),
      screenshot: () => Promise.resolve(new Uint8Array()),
    }))
    .register(ROOM_EVENTS, () => ({ ...events, connect: () => void connected++ }))
    .register(SPAWN_WORKER, () => spawnWorker)
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
    /** The `/` names of the tools, in the order the tools are listed. */
    commands: () =>
      container
        .resolve(TOOLS)()
        .flatMap((tool) => (tool.commands ?? []).map((command) => command.name)),
  };
}

// What a `/` can run: the tools' own commands, in the order the help shows them.
const ALL_COMMANDS = [
  '自动回复阈值',
  '自动回复间隔',
  '自动消息间隔',
  '最大回复条数',
  '自动谢礼',
  '截图',
  '识歌',
  '识别背景音乐',
  '点赞',
  '灯牌',
  '小心心',
  '解题',
  '自动识歌',
  '识别恶意言论',
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
  // Codex's default for the picker and malice watch, gpt-6-sol for the song id, and gpt-6-astra
  // for the puzzle tool: one for each effort the room can be set to.
  const models = bot.codexMade.map((over) => over.model);
  expect(models.filter((model) => model === undefined)).toHaveLength(2);
  expect(models.filter((model) => model === 'gpt-6-sol')).toHaveLength(1);
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
  // Jev is never made, and Codex only for the puzzle tool (always gpt-6-astra, at either effort).
  expect(bot.jevKeys).toEqual([]);
  expect(bot.codexMade.map((over) => over.model)).toEqual(['gpt-6-astra', 'gpt-6-astra']);
  expect(bot.logged).toContainEqual([
    'warn',
    '--codex is empty: auto-reply is off, the bot only talks when @ed',
  ]);
});

test('--no-asr has no transcriber, no /识歌, no /识别背景音乐 and no auto song id, and starts no worker', async () => {
  const bot = build(['--no-asr']);
  const app = bot.container.resolve(APP);
  await app.start();
  app.stop();

  expect(bot.container.resolve(TRANSCRIBER)).toBeNull();
  expect(bot.container.resolve(AUTO_SONG_ID)).toBeNull();
  // The song tool needs the transcript, so it goes with the speech.
  expect(bot.commands()).toEqual(
    ALL_COMMANDS.filter((name) => !['识歌', '识别背景音乐', '自动识歌'].includes(name)),
  );
  expect(bot.spawned).toEqual([]);
  expect(bot.connected()).toBe(1);
});

test('the song break sources rank the lyrics first, then the backing titles, then the backing gaps', () => {
  const bot = build();
  expect(bot.container.resolve(SONG_BREAK_SOURCES).map((source) => source.name)).toEqual([
    'lyrics',
    'shazam',
    'backingGaps',
  ]);
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
  expect(prompt).toContain('- 自动回复：关闭');
  expect(prompt).toContain('- 自动谢礼：关闭');
  expect(prompt).toContain('- 自动识歌：关闭');
});

test('a typed command runs the tool: an admin changes the setting in room_config.json, anyone else is refused', async () => {
  const bot = build(['--no-asr', '--codex', '']);
  const app = bot.container.resolve(APP);
  await app.start();
  const settle = async () => {
    await bot.container.resolve(BOT).idle();
    await bot.container.resolve(OUTBOX).idle();
  };
  bot.say(mention('雅', '7001', '@小助手 /自动谢礼 100'));
  await settle();
  bot.say(mention('小红', 'u-1', '@小助手 /自动谢礼 5'));
  await settle();
  app.stop();

  expect(bot.sent).toEqual([
    '@雅 已处理自动谢礼请求',
    '@小红 你无权调用「自动谢礼」指令，只有主播和雅才可以',
  ]);
  const config = readFileSync(join(bot.dir, 'data', '123', 'room_config.json'), 'utf8');
  expect(JSON.parse(config)).toMatchObject({ thanksThreshold: 100 });
});

test("starts filling in the room's room_config.json: an option seeds a missing setting, and what the file has wins", () => {
  const first = build(['--no-asr', '--thanks-threshold', '200']);
  first.container.resolve(APP);
  const path = join(first.dir, 'data', '123', 'room_config.json');
  expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
    private: false,
    aliases: [],
    thanksThreshold: 200,
    autoReplyThreshold: 1,
    solveEffort: 'medium',
  });

  // The next start, with another option: the file's value stays, with a warning.
  const options = parseCliOptions(
    [
      '--room',
      '123',
      '--bot-name',
      '小助手',
      '--data',
      join(first.dir, 'data'),
      '--thanks-threshold',
      '900',
    ],
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
  container.resolve(THANKER);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ thanksThreshold: 200 });
  expect(container.resolve(THANKER).threshold).toBe(200);
  expect(warned).toContain('setting from room_config, ignoring option');
});

test('the tools server starts with the bot, serves its tools (an admin the admin-only ones too), and stops with it', async () => {
  const bot = build(['--mcp-port', '0']);
  const app = bot.container.resolve(APP);
  const started = app.start();
  await Promise.resolve();
  bot.workerReady();
  await started;
  const session = bot.container.resolve(MCP_SERVER).open({ asker: 'a', question: '' })!;
  expect(session.access.tools).toEqual([
    'update_memory',
    'identify_song',
    'identify_bgm',
    'ask_about_puzzle',
  ]);
  const admin = bot.container.resolve(MCP_SERVER).open({ asker: 'a', question: '', admin: true })!;
  expect(admin.access.tools).toEqual(
    expect.arrayContaining(['set_thanks_threshold', 'identify_song', 'identify_bgm']),
  );
  app.stop();
  await jest
    .requireActual<typeof import('node:timers/promises')>('node:timers/promises')
    .setImmediate();
  expect(bot.container.resolve(MCP_SERVER).open({ asker: 'a', question: '' })).toBeNull();
});

test('a tools port that is taken stops the start', async () => {
  const busy = createServer().listen(0, '127.0.0.1');
  await once(busy, 'listening');
  const { port } = busy.address() as AddressInfo;
  const bot = build(['--mcp-port', String(port), '--no-asr', '--codex', '']);
  try {
    await expect(bot.container.resolve(APP).start()).rejects.toThrow(/EADDRINUSE/);
  } finally {
    busy.close();
  }
});

test('without speech, Codex or Jev the tools server still has the admin-only settings, and only memory and the puzzle for anyone else', async () => {
  const bot = build(['--mcp-port', '0', '--no-asr', '--codex', ''], {});
  const app = bot.container.resolve(APP);
  await app.start();
  const server = bot.container.resolve(MCP_SERVER);
  expect(server.open({ asker: 'a', question: '' })!.access.tools).toEqual([
    'update_memory',
    'ask_about_puzzle',
  ]);
  expect(server.open({ asker: 'a', question: '', admin: true })!.access.tools).toEqual([
    'set_auto_reply_threshold',
    'set_auto_reply_interval',
    'set_auto_message_interval',
    'set_max_reply_parts',
    'set_thanks_threshold',
    'update_memory',
    'set_screenshots',
    'press_like',
    'send_fans_lamp',
    'send_heart',
    'ask_about_puzzle',
  ]);
  app.stop();
});

test('the tools a room switches on are built from src/mcp/tools, beside the built-in ones', () => {
  const bot = build(
    ['--no-asr', '--codex', ''],
    {},
    {
      'room_config.json': JSON.stringify({ tools: ['can_sing', 'nope'], streamerNames: ['虾虾'] }),
    },
  );
  const tools = bot.container.resolve(TOOLS)();
  const names = tools.map((tool) => tool.name);
  expect(names).toEqual(expect.arrayContaining(['set_thanks_threshold', 'can_sing']));
  expect(names.indexOf('can_sing')).toBeGreaterThan(names.indexOf('ask_about_puzzle'));
  expect(names).not.toContain('what_song');
  expect(names).not.toContain('nope');
  expect(bot.logged).toContainEqual([
    'warn',
    'room_config.json lists a tool there is no definition for',
  ]);
  // Typed commands are the built-in tools' alone.
  expect(bot.commands()).not.toContain('can_sing');
  const canSing = tools.find((tool) => tool.name === 'can_sing')!;
  expect(canSing.description).toMatch(/^主播会唱xxx吗、有什么拿手的：/);
  expect(canSing.description).toContain('虾虾');
  expect(canSing.listen?.when).toBeDefined();
});

test('every tool with a / name is in the table of docs/commands.md, and the table names only tools there are', () => {
  // Every feature on: Jev, Codex and speech, so every tool exists.
  const bot = build();
  const tools = bot.container.resolve(TOOLS)();
  const built = tools.flatMap((tool) => (tool.commands ?? []).map((c) => [c.name, tool.name]));

  const lines = readFileSync(join(PACKAGE_DIR, 'docs', 'commands.md'), 'utf8').split('\n');
  const first = lines.findIndex((line) => line.startsWith('| `/'));
  const rows: string[] = [];
  for (let i = first; i < lines.length && lines[i]!.startsWith('|'); i++) rows.push(lines[i]!);
  // The cells of a row, `\|` inside one kept (`/截图 <0\|1>`).
  const documented = rows.map((row) => {
    const [, command = '', tool = ''] = row.split(/(?<!\\)\|/).map((cell) => cell.trim());
    return [/^`\/([^\s`]+)/.exec(command)?.[1], tool.replace(/`/g, '')];
  });

  expect(documented).toEqual(built);
});

test("every declarative tool in src/mcp/tools is in docs/commands.md's installable table, and the table names only tools there are", () => {
  const warned: string[] = [];
  const log: Log = {
    debug() {},
    info() {},
    warn: (message) => void warned.push(message),
    error() {},
  };
  const defined = loadToolDefinitions(join(PACKAGE_DIR, 'src', 'mcp', 'tools'), {
    roomDir: mkdtempSync(join(tmpdir(), 'chat-bot-tools-')),
    log,
  });
  // A bad tool.json in the repo fails the suite, not just a warning at start.
  expect(warned).toEqual([]);

  const lines = readFileSync(join(PACKAGE_DIR, 'docs', 'commands.md'), 'utf8').split('\n');
  const heading = lines.findIndex((line) => line === '## Tools a room switches on');
  const first = lines.findIndex((line, i) => i > heading && line.startsWith('| `'));
  const rows: string[] = [];
  for (let i = first; i < lines.length && lines[i]!.startsWith('|'); i++) rows.push(lines[i]!);
  const documented = rows.map((row) => /^\| `([^`]+)`/.exec(row)?.[1]);

  expect(documented.sort()).toEqual(defined.map(({ name }) => name).sort());
});
