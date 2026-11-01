import { ChatBot, type ChatBotOptions } from '../../../src/app/replies/chat-bot';
import { MentionAnswerer } from '../../../src/app/replies/mention-answerer';
import { RoomFeed } from '../../../src/app/room/room-feed';
import { newSession, type Session } from '../../../src/adapters/mcp/session';
import { declarativeTools } from '../../../src/app/tools/declarative-tools';
import { settingTool } from '../../../src/app/tools/setting-tool';
import { ToolRunner } from '../../../src/app/tools/tool-runner';
import type { BotTools, DefinedTool, Question } from '../../../src/app/ports';
import type { BotTool, ToolContext } from '../../../src/core/tools/bot-tool';
import { ChatHistory } from '../../../src/core/chat/chat-history';
import type { IncomingChat } from '../../../src/core/chat/room-events';
import { fakeRoom } from '../../support/fake-room';
import { fakeSettings } from '../../support/fake-settings';
import { BOT, chat, fakeBus, fakeEvents, fakeOutbox, silentLog } from '../../support/fakes';

const TEMPLATE = '{{history}}\n---\n{{asker}}: {{question}} ({{singleLength}})';

interface SetupOptions {
  answer?: string;
  template?: string;
  /** What Claude answers, from the question asked; instead of `answer`. */
  ask?: (question: Question, session: Session | undefined) => Promise<string>;
  admins?: string[];
  persona?: string;
  /** What a `/` can call, and what Claude may call in a session (an admin-only one only for an admin). */
  tools?: BotTool[] | ((answerer: Pick<MentionAnswerer, 'ask'>) => BotTool[]);
  /** Has the admin-only `/自动识歌` tool, which switches the room's auto song id. */
  autoSongIdTool?: boolean;
  toolRunner?: ChatBotOptions['toolRunner'];
}

/** The whole bot on fake events, Claude and outbox; mentions are answered by the real answerer. */
function setup(options: SetupOptions = {}) {
  const { events, say } = fakeEvents();
  const bus = fakeBus();
  const prompts: string[] = [];
  const questions: Question[] = [];
  const opened: ToolContext[] = [];
  const sessions: Session[] = [];
  const { outbox, sent } = fakeOutbox();
  const history = new ChatHistory(100);
  const settings = fakeSettings();
  const room = fakeRoom({
    history,
    settings,
    persona: () => options.persona ?? '',
  });
  const tools = (): BotTool[] => [
    ...(typeof options.tools === 'function' ? options.tools(answerer) : (options.tools ?? [])),
    ...(options.autoSongIdTool ? [settingTool('autoSongId', { settings, log: silentLog })] : []),
  ];
  // Claude's session, as the real server opens it, with the tools it may call.
  const botTools: BotTools = {
    open: (context) => {
      opened.push(context);
      const session = newSession(context, tools());
      sessions.push(session);
      return {
        access: { url: 'u', token: 't', tools: session.tools.map((tool) => tool.name) },
        calls: () => [...session.calls],
        close: () => {},
      };
    },
  };
  const answerer = new MentionAnswerer({
    ask: (question) => {
      prompts.push(question.prompt);
      questions.push(question);
      return options.ask
        ? options.ask(question, sessions.at(-1))
        : Promise.resolve(options.answer ?? '你好呀');
    },
    outbox,
    room,
    bus,
    log: silentLog,
    promptTemplate: () => options.template ?? TEMPLATE,
    tools: botTools,
    admins: new Set(options.admins),
  });
  const feed = new RoomFeed({ events, bus, bot: BOT, history, log: silentLog });
  const toolRunner =
    options.toolRunner ?? new ToolRunner({ tools, outbox, room, log: silentLog, adminNames: '雅' });
  const bot = new ChatBot({
    feed,
    bus,
    answerer,
    room,
    log: silentLog,
    admins: new Set(options.admins),
    toolRunner,
  });
  bot.start();
  return {
    bot,
    /** Waits for Claude's answers and for everything to be sent. */
    settle: async () => {
      await bot.idle();
      await outbox.idle();
    },
    say,
    prompts,
    questions,
    opened,
    sent,
  };
}

test('answers an @mention with the chat before it, and replies to the asker', async () => {
  const { settle, say, prompts, sent } = setup();
  say(chat('阿明', '主播好'));
  say(chat('小红', '今天讲什么'));
  say(chat('阿明', '@小助手 这题怎么做', [{ text: '@小助手', userId: 'bot-1' }]));
  await settle();

  expect(prompts).toEqual(['阿明: 主播好\n小红: 今天讲什么\n---\n阿明: 这题怎么做 (45)']);
  expect(sent).toEqual(['@阿明 你好呀']);
});

test('answers what someone said to it unprompted like a mention, saying it was not an @', async () => {
  const { bot, settle, prompts, sent } = setup({ template: '{{asked}}' });
  bot.replyUnprompted({
    nickname: '阿明',
    userId: 'u-阿明',
    question: '机器人几岁',
    heard: 'chat',
  });
  await settle();

  expect(prompts).toEqual([
    '阿明 没有 @ 你，是在弹幕里说到了你或在跟你说话，要回的话就主动回 TA 一句：机器人几岁',
  ]);
  expect(sent).toEqual(['@阿明 你好呀']);
});

test('the streamer is answered, as said on the stream', async () => {
  const { bot, settle, prompts } = setup({ admins: ['s-1'], template: '{{asked}}' });
  bot.replyUnprompted({
    nickname: '虾虾',
    userId: 's-1',
    question: '机器人说两句',
    heard: 'speech',
  });
  await settle();

  expect(prompts[0]).toBe(
    '主播 虾虾 没有 @ 你，是在直播里说到了你（语音识别，可能有错字），要回的话就主动回 TA 一句：机器人说两句',
  );
});

/** A fake `identify_song` tool: `/识歌` calls it, and what it says is sent. */
function identifySong(calls: { args: Record<string, unknown>; direct?: boolean }[]): BotTool {
  return {
    name: 'identify_song',
    description: '认歌',
    inputSchema: { type: 'object' },
    commands: [
      {
        name: '识歌',
        parse: (args) => ({ args: args ? { hint: args } : {} }),
        say: () => '这首是《aLIEz》',
      },
    ],
    call: (args, { direct }) => {
      calls.push({ args, direct });
      return Promise.resolve({ text: '{}' });
    },
  };
}

test('/识歌 calls its tool with no model asked, and says what the tool says', async () => {
  const calls: { args: Record<string, unknown>; direct?: boolean }[] = [];
  const { settle, say, prompts, sent } = setup({ tools: [identifySong(calls)] });
  say(chat('阿明', '@小助手 /识歌 日文的'));
  await settle();

  expect(calls).toEqual([{ args: { hint: '日文的' }, direct: true }]);
  expect(prompts).toEqual([]);
  expect(sent).toEqual(['@阿明 这首是《aLIEz》']);
});

test('a / command works only after an @ of the bot, not in a plain chat', async () => {
  const calls: { args: Record<string, unknown>; direct?: boolean }[] = [];
  const { settle, say, prompts, sent } = setup({ tools: [identifySong(calls)] });
  const at = [{ text: '@小助手', userId: 'bot-1' }];

  say(chat('阿明', '/识歌 日文的'));
  await settle();
  expect(calls).toEqual([]);
  expect(prompts).toEqual([]);
  expect(sent).toEqual([]);

  say(chat('阿明', '@小助手 /识歌 日文的', at));
  say(chat('阿明', '@小助手/识歌', at));
  say(chat('阿明', '@小助手 ／识歌', at));
  await settle();
  expect(calls).toHaveLength(3);
  expect(prompts).toEqual([]);
});

/** A chat from `nickname` with what room-feed says about them. */
const viewerChat = (nickname: string, content: string, extra: Partial<IncomingChat> = {}) => ({
  ...chat(nickname, content),
  ...extra,
});

test('who asked reaches Claude’s tools: an @’s viewer from their chat line, the streamer’s speech only as admin', async () => {
  const { bot, say, settle, opened } = setup({ admins: ['u-主播'] });
  say(
    viewerChat('阿明', `@${BOT.nickname} 你好`, {
      badges: ['V年'],
      fansClub: { level: 7 },
      payLevel: 31,
    }),
  );
  await settle();
  bot.replyUnprompted({
    nickname: '主播',
    userId: 'u-主播',
    question: '机器人说两句',
    heard: 'speech',
  });
  await settle();

  expect(opened[0]).toMatchObject({
    asker: '阿明',
    userId: 'u-阿明',
    admin: false,
    viewer: { admin: false, badges: ['V年'], fansClub: { level: 7 }, payLevel: 31 },
  });
  // The streamer's speech has no chat line, so only `admin` can match it.
  expect(opened[1]).toMatchObject({ admin: true, viewer: { admin: true } });
  expect(opened[1]?.viewer).toEqual({ admin: true });
});

const CAN_SING: DefinedTool = {
  name: 'can_sing',
  description: '主播会唱xxx吗',
  guidance: () => '歌单：晴天',
  listen: { when: '在问主播会不会唱某首歌', trigger: /会唱/ },
};

test("a tool's guidance comes back to Claude, who answers in the same turn", async () => {
  const results: string[] = [];
  const { say, settle, prompts, questions, sent } = setup({
    template: '{{asker}}: {{question}}',
    ask: async (_question, session) => {
      const result = await session!.tools[0]!.call({}, session!.context);
      results.push(result.text);
      return JSON.stringify({ message: '会唱', others: [] });
    },
    tools: (answerer) =>
      declarativeTools({
        definitions: () => [CAN_SING],
        enabled: () => ['can_sing'],
        say: (mention) => answerer.ask(mention),
        room: fakeRoom(),
        streamer: () => null,
        builtInNames: () => [],
        log: silentLog,
      })(),
  });
  say(chat('阿明', `@${BOT.nickname} 虾虾会唱晴天吗`));
  await settle();

  expect(results).toEqual(['歌单：晴天']);
  expect(prompts).toEqual(['阿明: 虾虾会唱晴天吗']);
  expect(questions[0]?.botTools?.tools).toEqual(['can_sing']);
  expect(sent).toEqual(['@阿明 会唱']);
});

test('runs a / command with the tool runner it is given, and waits for it in idle', async () => {
  const calls: { name: string; admin: boolean }[] = [];
  let finished = false;
  const { settle, say, prompts } = setup({
    toolRunner: {
      run: (_chat, call, admin) => calls.push({ name: call.name, admin }),
      idle: () => {
        finished = true;
        return Promise.resolve();
      },
    },
  });
  say(chat('阿明', '@小助手 /自动识歌 1', [{ text: '@小助手', userId: 'bot-1' }]));
  await settle();

  expect(calls).toEqual([{ name: '自动识歌', admin: false }]);
  expect(finished).toBe(true);
  expect(prompts).toEqual([]);
});
