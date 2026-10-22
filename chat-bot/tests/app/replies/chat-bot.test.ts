import { ChatBot } from '../../../src/app/replies/chat-bot';
import type { Command } from '../../../src/app/commands/command';
import { MentionAnswerer } from '../../../src/app/replies/mention-answerer';
import { RoomFeed } from '../../../src/app/room/room-feed';
import { screenshotCommand } from '../../../src/app/room/room-state';
import { SongId } from '../../../src/app/songs/song-id';
import { solveCommand } from '../../../src/app/commands/solve-command';
import { MESSAGE_SCHEMA } from '../../../src/core/replies/mention-answer';
import type { AdditionalCommand, Log, Question } from '../../../src/app/ports';
import { ChatHistory } from '../../../src/core/chat/chat-history';
import type { IncomingChat } from '../../../src/core/chat/room-events';
import { Transcript } from '../../../src/core/songs/transcript';
import { fakeRoom } from '../../support/fake-room';
import { BOT, chat, fakeBus, fakeEvents, fakeOutbox, silentLog } from '../../support/fakes';

const TEMPLATE = '{{history}}\n---\n{{asker}}: {{question}} ({{singleLength}})';

interface SetupOptions {
  answer?: string;
  template?: string;
  ask?: () => Promise<string>;
  admins?: string[];
  persona?: string;
  /** Instead of /截图. */
  commands?: Command[];
  /** Instead of the real answerer. */
  answerer?: Pick<MentionAnswerer, 'ask' | 'idle'>;
  now?: () => number;
  screenshot?: boolean;
  additionalCommands?: AdditionalCommand[];
  /** The room's streamer, once known. */
  streamer?: { uid: string };
  /** What the streamer said and sang. */
  transcript?: Transcript;
  log?: Log;
}

/** The whole bot on fake events, Claude and outbox; mentions are answered by the real answerer. */
function setup(options: SetupOptions = {}) {
  const { events, say } = fakeEvents();
  const bus = fakeBus();
  const prompts: string[] = [];
  const { outbox, sent } = fakeOutbox();
  const history = new ChatHistory(100);
  const room = fakeRoom({
    history,
    ...(options.transcript && { transcript: options.transcript }),
    persona: () => options.persona ?? '',
    // A live video to screenshot, with screenshots off (/截图 0).
    ...(options.screenshot && {
      screenshot: () => Promise.resolve(new Uint8Array([0xff, 0xd8])),
      screenshotsOn: false,
    }),
  });
  const answerer =
    options.answerer ??
    new MentionAnswerer({
      ask: ({ prompt }) => {
        prompts.push(prompt);
        return options.ask ? options.ask() : Promise.resolve(options.answer ?? '你好呀');
      },
      outbox,
      room,
      bus,
      log: options.log ?? silentLog,
      promptTemplate: () => options.template ?? TEMPLATE,
      onCommandRequest: (mention, name, args) => bot.requestCommand(mention, name, args),
    });
  const feed = new RoomFeed({ events, bus, bot: BOT, history, log: silentLog });
  const bot: ChatBot = new ChatBot({
    feed,
    bus,
    answerer,
    room,
    outbox,
    log: options.log ?? silentLog,
    admins: new Set(options.admins),
    streamer: () => options.streamer ?? null,
    commands: options.commands ?? [screenshotCommand(room)],
    now: options.now,
    adminNames: '雅',
    additionalCommands: () => options.additionalCommands ?? [],
  });
  bot.start();
  return {
    bot,
    room,
    /** Waits for Claude's answers and for everything to be sent. */
    settle: async () => {
      await bot.idle();
      await outbox.idle();
    },
    say,
    prompts,
    sent,
    outbox,
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

test('a long unprompted answer is split like an @', async () => {
  const { bot, settle, sent } = setup({ answer: '好'.repeat(80) });
  bot.replyUnprompted({
    nickname: '阿明',
    userId: 'u-阿明',
    question: '机器人几岁',
    heard: 'chat',
  });
  await settle();

  expect(sent.length).toBeGreaterThan(1);
  expect(sent[0]).toMatch(/^@阿明 \(1\/\d\) 好/);
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

test('asked in words for an admin-only command, an admin has it run, as if typed', async () => {
  const answer = JSON.stringify({
    message: '好的，这就看',
    command_request: '截图',
    command_args: '1',
  });
  const { settle, say, sent, room } = setup({ answer, admins: ['u-雅'], screenshot: true });
  say(chat('雅', '@小助手 把截图打开'));
  await settle();

  expect(room.screenshots).toBe(true);
  expect(sent).toEqual(['@雅 已处理截图请求']);
});

test('anyone else asking for an admin-only command is told who may', async () => {
  const answer = JSON.stringify({
    message: '好的，这就看',
    command_request: '截图',
    command_args: '1',
  });
  const { settle, say, sent, room } = setup({ answer, admins: ['u-雅'], screenshot: true });
  say(chat('阿明', '@小助手 把截图打开'));
  await settle();

  expect(room.screenshots).toBe(false);
  expect(sent).toEqual(['@阿明 你无权调用「截图」指令，只有主播和雅才可以']);
});

test('asked in words for a command anyone may use, anyone has it run, as if typed', async () => {
  const answer = JSON.stringify({
    message: '收到，这就听一下',
    command_request: '识别背景音乐',
    command_args: '',
  });
  const music: Command = {
    name: '识别背景音乐',
    adminOnly: false,
    run: () => Promise.resolve({ ok: true, reply: '是《晴天》，周杰伦' }),
  };
  const { settle, say, sent } = setup({ answer, commands: [music] });
  say(chat('阿明', '@小助手 识别一下背景音乐'));
  await settle();

  // The command's answer goes out, not Claude's; the @'s 2 diamonds come back, and the command takes its 1.
  expect(sent).toEqual(['@阿明 是《晴天》，周杰伦']);
});

test('the streamer asking on the stream has the command run too', async () => {
  const answer = JSON.stringify({
    message: '收到，这就听一下',
    command_request: '识别背景音乐',
    command_args: '',
  });
  let ran = 0;
  const music: Command = {
    name: '识别背景音乐',
    adminOnly: false,
    run: () => {
      ran++;
      return { ok: true, reply: '是《晴天》，周杰伦' };
    },
  };
  const { bot, settle, sent } = setup({ answer, admins: ['s-1'], commands: [music] });
  bot.replyUnprompted({
    nickname: '虾虾',
    userId: 's-1',
    question: 'FERRY识别一下我的背景音乐',
    heard: 'speech',
  });
  await settle();

  expect(ran).toBe(1);
  expect(sent).toEqual(['@虾虾 是《晴天》，周杰伦']);
});

test("asked for a command there isn't, Claude's own reply goes out", async () => {
  const answer = JSON.stringify({
    message: '这个我还不会',
    command_request: '点歌',
    command_args: '晴天',
  });
  const { settle, say, sent } = setup({ answer, commands: [] });
  say(chat('阿明', '@小助手 帮我点首晴天'));
  await settle();

  expect(sent).toEqual(['@阿明 这个我还不会']);
});

test('/解题 is answered by its own Claude, from its own prompt, with a screenshot even while they are off', async () => {
  const asked: Question[] = [];
  const solve = solveCommand({
    name: '解题',
    prompt: () => '解题：{{question}}',
    ask: (question) => {
      asked.push(question);
      return Promise.resolve(JSON.stringify({ message: '选C，按面积分' }));
    },
  });
  const { settle, say, sent, prompts } = setup({
    commands: [solve],
    screenshot: true,
    admins: ['u-阿明'],
  });
  say(chat('阿明', '@小助手 /解题 这题选什么'));
  await settle();

  expect(prompts).toEqual([]);
  expect(asked[0]!.prompt).toBe('解题：这题选什么');
  expect(asked[0]!.image).toBeDefined();
  expect(asked[0]!.schema).toEqual(MESSAGE_SCHEMA);
  expect(sent).toEqual(['@阿明 选C，按面积分']);
});

test('ignores commands from anyone but an admin, and answers bad ones with how to use them', async () => {
  const admin = (name: string): Command => ({
    name,
    adminOnly: true,
    run: () => ({ ok: false, reply: '阈值要写成钻石数，用法：/自动谢礼 100' }),
  });
  const commands = ['截图', '最大回复条数', '自动回复阈值', '自动谢礼'].map(admin);
  const { settle, say, prompts, sent } = setup({ admins: ['u-管理'], commands });
  say(chat('阿明', '@小助手 /自动谢礼 0'));
  say(chat('管理', '@小助手 /自动谢礼 两钻'));
  say(chat('管理', '@小助手 /删库'));
  await settle();

  expect(prompts).toEqual([]);
  expect(sent).toEqual([
    '@管理 阈值要写成钻石数，用法：/自动谢礼 100',
    '@管理 没有指令「删库」，可用的有：截图、最大回复条数、自动回复阈值、自动谢礼',
  ]);
});

test('anyone can run a public command, and only an admin an admin-only one', async () => {
  const ran: string[] = [];
  const commands: Command[] = [
    {
      name: '点歌',
      adminOnly: false,
      run: (args) => {
        ran.push(args);
        return args ? { ok: true, reply: `已点歌：${args}` } : { ok: false, reply: '要写歌名' };
      },
    },
    {
      name: '清空',
      adminOnly: true,
      run: () => ({ ok: true, reply: '已清空' }),
    },
  ];
  const { settle, say, sent } = setup({ admins: ['u-管理'], commands });
  say(chat('阿明', '@小助手 /点歌 晴天'));
  say(chat('阿明', '@小助手 /点歌'));
  say(chat('阿明', '@小助手 /清空'));
  say(chat('阿明', '@小助手 /点歌 稻香'));
  say(chat('阿明', '@小助手 /点歌 七里香'));
  await settle();

  expect(ran).toEqual(['晴天', '', '稻香', '七里香']);
  expect(sent).toEqual([
    '@阿明 已点歌：晴天',
    '@阿明 要写歌名',
    '@阿明 没有指令「清空」，可用的有：点歌',
    '@阿明 已点歌：稻香',
    '@阿明 已点歌：七里香',
  ]);
});

test('a command with nothing to say says nothing', async () => {
  const commands: Command[] = [
    { name: '静音', adminOnly: false, run: () => ({ ok: true, reply: '' }) },
  ];
  const { settle, say, sent } = setup({ commands });
  say(chat('管理', '@小助手 /静音'));
  await settle();

  expect(sent).toEqual([]);
});

test('/识歌 asks its own model with its own prompt, answered like a mention', async () => {
  const asked: string[] = [];
  const songId = new SongId({
    prompt: () => '识歌:{{question}}',
    codex: ({ prompt }) => {
      asked.push(prompt);
      return Promise.resolve('这首是《aLIEz》');
    },
    log: silentLog,
  });
  const { settle, say, prompts, sent } = setup({ commands: songId.commands() });
  say(chat('阿明', '@小助手 /识歌 日文的'));
  say(chat('阿明', '@小助手 /识歌'));
  await settle();

  expect(asked).toEqual(['识歌:日文的', '识歌:（只 @ 了你，没有说别的）']);
  expect(prompts).toEqual([]);
  expect(sent).toEqual(['@阿明 这首是《aLIEz》', '@阿明 这首是《aLIEz》']);
});

const WHAT_SONG: AdditionalCommand = {
  id: 'what-song',
  name: '这是什么歌',
  when: '在问现在放的是什么歌',
  trigger: /什么歌/,
  prompt: () => '',
  run: '识别背景音乐',
  runWhileSinging: '识歌',
};

/** /识歌 and /识别背景音乐, each answering with its own name, noting in `ran` that it ran. */
const songCommands = (ran: string[]): Command[] =>
  ['识歌', '识别背景音乐'].map((name) => ({
    name,
    adminOnly: false,
    run: () => {
      ran.push(name);
      return { ok: true, reply: `${name}的结果` };
    },
  }));

test("a room command that runs one of the bot's: the background music, or the song while the streamer sings", async () => {
  let now = 100_000;
  const transcript = new Transcript(Infinity, () => now);
  const ran: string[] = [];
  const { bot, settle, sent } = setup({
    transcript,
    now: () => now,
    commands: songCommands(ran),
    additionalCommands: [WHAT_SONG],
  });
  const ask = (question: string) =>
    bot.replyUnprompted({
      nickname: '阿明',
      userId: 'u-阿明',
      question,
      heard: 'chat',
      command: 'what-song',
    });
  ask('这是什么歌');
  await settle();
  // Three lines sung in the last minute: she's singing.
  for (const end of [180_000, 188_000, 196_000]) {
    transcript.add({ start: end - 3000, end, text: '啦啦啦', speech: 0.05 });
  }
  now = 200_000;
  ask('这首叫什么');
  await settle();

  expect(ran).toEqual(['识别背景音乐', '识歌']);
  expect(sent).toEqual(['@阿明 识别背景音乐的结果', '@阿明 识歌的结果']);
});

test("an @ matching such a command's trigger goes to Claude, and runs it when Claude asks for it", async () => {
  const ran: string[] = [];
  const answer = JSON.stringify({
    message: '我听听',
    command_request: 'what-song',
    command_args: '',
  });
  const { settle, say, sent, prompts } = setup({
    answer,
    commands: songCommands(ran),
    additionalCommands: [WHAT_SONG],
  });
  say(chat('阿明', '@小助手 这是什么歌'));
  await settle();

  expect(prompts).toHaveLength(1);
  expect(ran).toEqual(['识别背景音乐']);
  expect(sent).toEqual(['@阿明 识别背景音乐的结果']);
});

const CAN_SING: AdditionalCommand = {
  id: 'can-sing',
  name: '主播会唱xxx吗',
  when: '在问主播会不会唱某首歌',
  trigger: /会唱/,
  prompt: () => '歌单：晴天\n{{asker}} 问的：{{question}}',
};

test("what auto-reply picked for one of the room's own commands is answered with its prompt", async () => {
  const { bot, settle, prompts, sent } = setup({
    answer: JSON.stringify({ message: '会唱哦，《晴天》在歌单里' }),
    additionalCommands: [CAN_SING],
  });
  bot.replyUnprompted({
    nickname: '阿明',
    userId: 'u-阿明',
    question: '虾虾会唱晴天吗',
    heard: 'chat',
    command: 'can-sing',
  });
  await settle();
  expect(prompts).toEqual(['歌单：晴天\n阿明 问的：虾虾会唱晴天吗']);
  expect(sent.at(-1)).toBe('@阿明 会唱哦，《晴天》在歌单里');
});

test("a mention Claude finds asking for one of the room's own commands is asked again with its prompt", async () => {
  const answers = [
    JSON.stringify({ message: '我看看', command_request: 'can-sing', command_args: '' }),
    JSON.stringify({ message: '会唱哦，《晴天》在歌单里' }),
  ];
  const { say, settle, prompts, sent } = setup({
    ask: () => Promise.resolve(answers.shift()!),
    additionalCommands: [CAN_SING],
  });
  // Not the trigger's words, so it's the usual prompt that finds the command.
  say(chat('阿明', `@${BOT.nickname} 晴天在歌单里吗`));
  await settle();

  expect(prompts[1]).toBe('歌单：晴天\n阿明 问的：晴天在歌单里吗');
  expect(sent).toEqual(['@阿明 会唱哦，《晴天》在歌单里']);
});

test("an admin-only room command that @s others: an admin's request @s each, a viewer's gets Claude's own reply", async () => {
  const OLD_SCORES: AdditionalCommand = {
    id: 'old-scores',
    name: '翻旧账',
    when: '主播要翻旧账',
    trigger: null,
    prompt: () => '{{asker}} 要：{{question}}',
    adminOnly: true,
    atOthers: true,
  };
  const asked = JSON.stringify({
    message: '我翻翻',
    command_request: 'old-scores',
    command_args: '',
  });
  const answers = [
    asked,
    JSON.stringify({
      message: '翻完了，两位',
      others: [
        { to: '@白生漓', message: '报了5还喊秒了，答案是3' },
        { to: '静弦', message: '一眼看出个7' },
        { to: '没话说', message: ' ' },
      ],
    }),
    asked,
  ];
  const { say, bot, settle, sent } = setup({
    admins: ['u-雅'],
    ask: () => Promise.resolve(answers.shift()!),
    additionalCommands: [OLD_SCORES],
  });
  say(chat('雅', `@${BOT.nickname} 翻旧账 5分钟`));
  await settle();
  expect(sent).toEqual(['@雅 翻完了，两位', '@白生漓 报了5还喊秒了，答案是3', '@静弦 一眼看出个7']);

  say(chat('阿明', `@${BOT.nickname} 翻旧账`));
  await settle();
  expect(sent.at(-1)).toBe('@阿明 我翻翻');
  // Nor when auto-reply picks a viewer's line for it.
  bot.replyUnprompted({
    nickname: '阿明',
    userId: 'u-阿明',
    question: '翻旧账',
    heard: 'chat',
    command: 'old-scores',
  });
  await settle();
  expect(sent).toHaveLength(4);
});

test("a mention matching a room command's trigger is answered with that command", async () => {
  const { say, settle, prompts, sent } = setup({
    answer: JSON.stringify({ message: '会唱哦，《晴天》在歌单里' }),
    additionalCommands: [CAN_SING],
  });
  say(chat('阿明', `@${BOT.nickname} 虾会唱晴天吗`));
  await settle();

  expect(prompts).toEqual(['歌单：晴天\n阿明 问的：虾会唱晴天吗']);
  expect(sent).toEqual(['@阿明 会唱哦，《晴天》在歌单里']);
});

test("a mention a room command's trigger took is answered as usual when the command says nothing", async () => {
  const answers = [JSON.stringify({ message: '' }), JSON.stringify({ message: '会生气的' })];
  const { say, settle, prompts, sent } = setup({
    template: '{{asker}}: {{question}}',
    ask: () => Promise.resolve(answers.shift()!),
    additionalCommands: [CAN_SING],
  });
  say(chat('阿明', `@${BOT.nickname} 虾虾会唱完就生气吗`));
  await settle();

  expect(prompts).toEqual([
    '歌单：晴天\n阿明 问的：虾虾会唱完就生气吗',
    '阿明: 虾虾会唱完就生气吗',
  ]);
  expect(sent).toEqual(['@阿明 会生气的']);
});

/** A chat from `nickname` with what room-feed says about them. */
const viewerChat = (nickname: string, content: string, extra: Partial<IncomingChat> = {}) => ({
  ...chat(nickname, content),
  ...extra,
});

const FIXED: AdditionalCommand = {
  id: 'greet',
  name: '打招呼',
  when: '在打招呼',
  trigger: /你好呀/,
  prompt: () => '',
  fixedReply: '欢迎来到直播间！',
};

test('a room command with a fixed reply sends that text with no model asked, and the @ is not answered again', async () => {
  const info = jest.fn();
  const { say, settle, prompts, sent } = setup({
    log: { ...silentLog, info },
    additionalCommands: [FIXED],
  });
  say(chat('阿明', `@${BOT.nickname} 你好呀`));
  await settle();

  expect(prompts).toEqual([]);
  expect(sent).toEqual(['@阿明 欢迎来到直播间！']);
  expect(info).toHaveBeenCalledWith('fixed reply', { id: 'greet', asker: '阿明' });
});

test("a fixed reply is sent when auto-reply picks the command, and when Claude asks for it for an @ (Claude's own words not sent)", async () => {
  const { bot, say, settle, prompts, sent } = setup({
    answer: JSON.stringify({ message: '我看看', command_request: 'greet', command_args: '' }),
    additionalCommands: [FIXED],
  });
  bot.replyUnprompted({
    nickname: '阿明',
    userId: 'u-阿明',
    question: '你好呀',
    heard: 'chat',
    command: 'greet',
  });
  await settle();
  expect(prompts).toEqual([]);
  expect(sent).toEqual(['@阿明 欢迎来到直播间！']);

  say(chat('小红', `@${BOT.nickname} 问个好`));
  await settle();
  expect(prompts).toHaveLength(1);
  expect(sent.at(-1)).toBe('@小红 欢迎来到直播间！');
  expect(sent).toHaveLength(2);
});

test('a long fixed reply is split like any reply', async () => {
  const { say, settle, sent } = setup({
    additionalCommands: [{ ...FIXED, fixedReply: '字'.repeat(80) }],
  });
  say(chat('阿明', `@${BOT.nickname} 你好呀`));
  await settle();
  expect(sent.length).toBeGreaterThan(1);
  expect(sent[0]).toMatch(/^@阿明 \(1\/\d\) /);
});

/** FIXED for badge holders only, or for anyone but them. */
const FILTERED = (filter: Partial<AdditionalCommand>): AdditionalCommand => ({
  ...FIXED,
  ...filter,
});

test("a command's except filter skips a trigger-taken @ from a viewer it names: nothing is sent or asked", async () => {
  const info = jest.fn();
  const { say, settle, prompts, sent } = setup({
    log: { ...silentLog, info },
    additionalCommands: [FILTERED({ except: [{ badge: 'V' }, { badge: 'V年' }] })],
  });
  say(viewerChat('阿明', `@${BOT.nickname} 你好呀`, { badges: ['V年'] }));
  await settle();

  expect(prompts).toEqual([]);
  expect(sent).toEqual([]);
  expect(info).toHaveBeenCalledWith('skipped by user filter', {
    id: 'greet',
    asker: '阿明',
    userId: 'u-阿明',
  });

  // Anyone else, or without badges (room-feed doesn't send them yet), gets it.
  say(viewerChat('阿明', `@${BOT.nickname} 你好呀`, { badges: ['别的'] }));
  say(chat('阿明', `@${BOT.nickname} 你好呀`));
  await settle();
  expect(sent).toEqual(['@阿明 欢迎来到直播间！', '@阿明 欢迎来到直播间！']);
});

test('a trigger-taken @ goes to the first matching command that applies to the viewer', async () => {
  const { say, settle, sent } = setup({
    additionalCommands: [
      FILTERED({ id: 'for-fans', fixedReply: '粉丝好', only: [{ fansLevel: 5 }] }),
      FILTERED({ id: 'for-all', fixedReply: '你好' }),
    ],
  });
  say(chat('阿明', `@${BOT.nickname} 你好呀`));
  say(viewerChat('小红', `@${BOT.nickname} 你好呀`, { fansClub: { level: 7 } }));
  await settle();
  expect(sent).toEqual(['@阿明 你好', '@小红 粉丝好']);
});

test("only fansLevel counts the streamer's fan club: one for another anchor does not, one that says nothing does", async () => {
  const { say, settle, sent } = setup({
    streamer: { uid: 'streamer-1' },
    additionalCommands: [FILTERED({ only: [{ fansLevel: 10 }] })],
  });
  const asked = `@${BOT.nickname} 你好呀`;
  say(viewerChat('甲', asked, { fansClub: { level: 12, anchorId: 'streamer-2' } }));
  say(viewerChat('乙', asked, { fansClub: { level: 9, anchorId: 'streamer-1' } }));
  say(viewerChat('丙', asked, { fansClub: { level: 12, anchorId: 'streamer-1' } }));
  say(viewerChat('丁', asked, { fansClub: { level: 10 } }));
  say(chat('戊', asked));
  await settle();
  expect(sent).toEqual(['@丙 欢迎来到直播间！', '@丁 欢迎来到直播间！']);
});

test('only payLevel and admin: a wealth level at least that, or the streamer or an admin', async () => {
  const { say, settle, sent } = setup({
    admins: ['u-管理'],
    additionalCommands: [FILTERED({ only: [{ payLevel: 20 }, { admin: true }] })],
  });
  const asked = `@${BOT.nickname} 你好呀`;
  say(viewerChat('甲', asked, { payLevel: 19 }));
  say(viewerChat('乙', asked, { payLevel: 20 }));
  say(chat('管理', asked));
  await settle();
  expect(sent).toEqual(['@乙 欢迎来到直播间！', '@管理 欢迎来到直播间！']);
});

test('in a 私密 room badge and level conditions never match without them, and a viewer who has a wealth level can', async () => {
  const hidden = { ...chat('苦***', `@${BOT.nickname} 你好呀`), userId: '111111-苦***-31' };
  const { say, settle, sent } = setup({
    additionalCommands: [
      FILTERED({ id: 'badge', fixedReply: '会员', only: [{ badge: 'V' }] }),
      FILTERED({ id: 'fans', fixedReply: '粉丝', only: [{ fansLevel: 1 }] }),
      FILTERED({ id: 'rich', fixedReply: '土豪', only: [{ payLevel: 30 }] }),
    ],
  });
  say(hidden);
  await settle();
  expect(sent).toEqual([]);

  say({ ...hidden, payLevel: 31 });
  await settle();
  expect(sent).toEqual(['@苦*** 土豪']);
});

test('a command filtered out for an @ that Claude asked it for is not answered', async () => {
  const { say, settle, prompts, sent } = setup({
    answer: JSON.stringify({ message: '我看看', command_request: 'greet', command_args: '' }),
    additionalCommands: [FILTERED({ only: [{ badge: 'V' }] })],
  });
  say(chat('阿明', `@${BOT.nickname} 问个好`));
  await settle();
  expect(prompts).toHaveLength(1);
  expect(sent).toEqual([]);
});

test("what auto-reply picked is skipped for a viewer the filter excludes, and the streamer's speech matches only admin", async () => {
  const { bot, say, settle, prompts, sent } = setup({
    admins: ['u-主播'],
    additionalCommands: [
      FILTERED({ except: [{ payLevel: 10 }] }),
      FILTERED({ id: 'admins', fixedReply: '主播好', only: [{ admin: true }, { badge: 'V' }] }),
    ],
  });
  say(viewerChat('阿明', '你好呀', { payLevel: 10 }));
  bot.replyUnprompted({
    nickname: '阿明',
    userId: 'u-阿明',
    question: '你好呀',
    heard: 'chat',
    command: 'greet',
  });
  await settle();
  expect(sent).toEqual([]);

  // The streamer's speech has no badges, even if their chat lines have.
  say(viewerChat('主播', '你好呀', { badges: ['V'], payLevel: 99 }));
  bot.replyUnprompted({
    nickname: '主播',
    userId: 'u-主播',
    question: '你好呀',
    heard: 'speech',
    command: 'admins',
  });
  await settle();
  expect(prompts).toEqual([]);
  expect(sent).toEqual(['@主播 主播好']);
});
