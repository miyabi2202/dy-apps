import { Billing } from '../../../src/app/commands/billing';
import { ChatBot } from '../../../src/app/replies/chat-bot';
import type { Command } from '../../../src/app/commands/command';
import { MentionAnswerer, type Mention } from '../../../src/app/replies/mention-answerer';
import { RoomFeed } from '../../../src/app/room/room-feed';
import { screenshotCommand } from '../../../src/app/room/room-state';
import { SongId } from '../../../src/app/songs/song-id';
import { solveCommand } from '../../../src/app/commands/solve-command';
import { MESSAGE_SCHEMA } from '../../../src/core/replies/mention-answer';
import type { AdditionalCommand, Log, Question } from '../../../src/app/ports';
import { ChatHistory } from '../../../src/core/chat/chat-history';
import type { IncomingChat } from '../../../src/core/chat/room-events';
import { Transcript } from '../../../src/core/songs/transcript';
import type { Wallet } from '../../../src/core/viewers/wallet';
import { fakeRoom } from '../../support/fake-room';
import {
  BOT,
  chat,
  fakeBus,
  fakeEvents,
  fakeOutbox,
  gift,
  memoryWallet,
  silentLog,
} from '../../support/fakes';

const TEMPLATE = '{{history}}\n---\n{{asker}}: {{question}} ({{singleLength}})';

interface SetupOptions {
  answer?: string;
  template?: string;
  wallet?: Wallet;
  cost?: number;
  ask?: () => Promise<string>;
  admins?: string[];
  persona?: string;
  /** Instead of /截图 and (with a wallet) the price. */
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
  const { events, say, give } = fakeEvents();
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
  const billing = options.wallet && new Billing({ wallet: options.wallet, cost: options.cost });
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
      billing,
      onCommandRequest: (mention, name, args) => bot.requestCommand(mention, name, args),
    });
  const feed = new RoomFeed({ events, bus, bot: BOT, history, log: silentLog, billing });
  const bot: ChatBot = new ChatBot({
    feed,
    bus,
    answerer,
    room,
    outbox,
    log: options.log ?? silentLog,
    billing,
    admins: new Set(options.admins),
    streamer: () => options.streamer ?? null,
    commands: options.commands ?? [screenshotCommand(room), ...(billing?.commands() ?? [])],
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
    give,
    prompts,
    sent,
    outbox,
  };
}

test('drops a mention the answerer cannot take, and gives the diamond back', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const asked: Mention[] = [];
  const { settle, say } = setup({
    wallet,
    answerer: {
      ask: (mention) => {
        asked.push(mention);
        return false;
      },
      idle: () => Promise.resolve(),
    },
  });
  say(chat('阿明', '@小助手 在吗'));
  await settle();

  expect(asked).toEqual([
    { asker: '阿明', userId: 'u-阿明', paid: 1, question: '在吗', history: [] },
  ]);
  expect(wallet.balance('u-阿明')).toBe(1);
});

test('answers an @mention with the chat before it, and replies to the asker', async () => {
  const { settle, say, prompts, sent } = setup();
  say(chat('阿明', '主播好'));
  say(chat('小红', '今天讲什么'));
  say(chat('阿明', '@小助手 这题怎么做', [{ text: '@小助手', userId: 'bot-1' }]));
  await settle();

  expect(prompts).toEqual(['阿明: 主播好\n小红: 今天讲什么\n---\n阿明: 这题怎么做 (45)']);
  expect(sent).toEqual(['@阿明 你好呀']);
});

test('gifts pay for mentions: each one costs the set price', async () => {
  const wallet = memoryWallet();
  const { settle, say, give, prompts, sent } = setup({ wallet, cost: 2 });
  give(gift('阿明', 3, 1));
  say(chat('阿明', '@小助手 第一问'));
  await settle();

  expect(prompts).toHaveLength(1);
  expect(sent).toEqual(['@阿明 你好呀']);
  expect(wallet.balance('u-阿明')).toBe(1);
});

test('tells a viewer who cannot pay, once a minute, without asking Claude', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 1 } });
  const { settle, say, prompts, sent } = setup({ wallet, cost: 1 });
  say(chat('阿明', '@小助手 第一问'));
  say(chat('阿明', '@小助手 第二问'));
  await settle();

  expect(prompts).toEqual([]);
  expect(sent).toEqual([
    '@阿明 @我要先给主播送礼：每次1钻，你送的还剩0钻（不另外扣钱），送了马上回你',
  ]);
});

test("a viewer who couldn't pay is answered once they send a gift, within 5 minutes", async () => {
  let now = 0;
  const wallet = memoryWallet();
  const { settle, say, give, prompts, sent } = setup({ wallet, cost: 2, now: () => now });
  say(chat('阿明', '@小助手 第一问'));
  say(chat('阿明', '@小助手 第二问'));
  give(gift('阿明', 1, 1));
  await settle();
  expect(prompts).toEqual([]);

  now = 4 * 60_000;
  give(gift('阿明', 1, 1));
  await settle();
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('阿明: 第二问');
  expect(sent.at(-1)).toBe('@阿明 你好呀');
  expect(wallet.balance('u-阿明')).toBe(0);

  give(gift('阿明', 2, 1));
  await settle();
  expect(prompts).toHaveLength(1);
});

test('in a 私密 room, an unpaid mention is answered after a gift from the same viewer, and no other', async () => {
  const wallet = memoryWallet();
  const { settle, say, give, prompts, sent } = setup({ wallet, cost: 1 });
  const viewer = { userId: '111111-苦***-31' };
  say({ ...chat('苦***', '@小助手 在吗'), ...viewer });
  give({ ...gift('苦***', 1, 1), userId: '111111-苦***-45' }); // another level: another viewer
  await settle();
  expect(prompts).toEqual([]);

  give({ ...gift('苦***', 1, 1), ...viewer });
  await settle();
  expect(prompts).toHaveLength(1);
  expect(sent.at(-1)).toBe('@苦*** 你好呀');
  expect(wallet.balance('111111-苦***-31')).toBe(0);
});

test('an unpaid mention is forgotten after 5 minutes', async () => {
  let now = 0;
  const wallet = memoryWallet();
  const { settle, say, give, prompts } = setup({ wallet, cost: 1, now: () => now });
  say(chat('阿明', '@小助手 在吗'));
  now = 5 * 60_000 + 1;
  give(gift('阿明', 1, 1));
  await settle();

  expect(prompts).toEqual([]);
  expect(wallet.balance('u-阿明')).toBe(1);
});

test('answers what someone said to it unprompted like a mention, charged, saying it was not an @', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const { bot, settle, prompts, sent } = setup({ wallet, cost: 1, template: '{{asked}}' });
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
  expect(wallet.balance('u-阿明')).toBe(0);
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

test('the streamer is answered for free, as said on the stream', async () => {
  const wallet = memoryWallet();
  const { bot, settle, prompts } = setup({ wallet, admins: ['s-1'], template: '{{asked}}' });
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

test('someone who cannot pay for an unprompted answer is told in other words, and answered after a gift', async () => {
  const wallet = memoryWallet();
  const { bot, settle, give, prompts, sent } = setup({ wallet, cost: 1, template: '{{asked}}' });
  bot.replyUnprompted({
    nickname: '阿明',
    userId: 'u-阿明',
    question: '机器人几岁',
    heard: 'chat',
  });
  await settle();
  expect(sent).toEqual([
    '@阿明 你在跟我说话吗？要先给主播送礼：每次1钻，你送的还剩0钻（不另外扣钱），送了马上回你',
  ]);

  give(gift('阿明', 1, 1));
  await settle();
  expect(prompts).toEqual([
    '阿明 没有 @ 你，是在弹幕里说到了你或在跟你说话，要回的话就主动回 TA 一句：机器人几岁',
  ]);
  expect(sent.at(-1)).toBe('@阿明 你好呀');
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
    price: 1,
    run: () => Promise.resolve({ ok: true, reply: '是《晴天》，周杰伦' }),
  };
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 5, spent: 0 } });
  const { settle, say, sent } = setup({ answer, wallet, cost: 2, commands: [music] });
  say(chat('阿明', '@小助手 识别一下背景音乐'));
  await settle();

  // The command's answer goes out, not Claude's; the @'s 2 diamonds come back, and the command takes its 1.
  expect(sent).toEqual(['@阿明 是《晴天》，周杰伦']);
  expect(wallet.balance('u-阿明')).toBe(4);
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

test('a low-balance notice goes out while Claude is still answering someone else', async () => {
  let finish: (answer: string) => void = () => {};
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const { settle, say, sent, outbox } = setup({
    wallet,
    ask: () => new Promise((resolve) => (finish = resolve)),
  });
  say(chat('阿明', '@小助手 慢慢想'));
  say(chat('小红', '@小助手 我没钱'));
  await outbox.idle();

  expect(sent).toEqual([
    '@小红 @我要先给主播送礼：每次1钻，你送的还剩0钻（不另外扣钱），送了马上回你',
  ]);
  finish('想好了');
  await settle();
  expect(sent).toEqual([
    '@小红 @我要先给主播送礼：每次1钻，你送的还剩0钻（不另外扣钱），送了马上回你',
    '@阿明 想好了',
  ]);
});

test('an admin changes the price, confirmed with a system message', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 2, spent: 0 } });
  const { settle, say, prompts, sent } = setup({
    wallet,
    admins: ['u-管理'],
    persona: '数学老师',
    template: '{{persona}}|{{question}}',
  });
  say(chat('管理', '@小助手 第一问'));
  say(chat('管理', '@小助手 /修改收费\u30002'));
  say(chat('阿明', '@小助手 第二问'));
  await settle();

  // Admins ask for free; 阿明's 2 diamonds now pay for one mention.
  expect(prompts).toEqual(['你的人设是数学老师|第一问', '你的人设是数学老师|第二问']);
  expect(wallet.balance('u-阿明')).toBe(0);
  // Commands take effect at once; the answers wait for Claude.
  expect(sent).toEqual(['@管理 已处理修改收费请求', '@管理 你好呀', '@阿明 你好呀']);
});

test('ignores commands from anyone but an admin, and answers bad ones with how to use them', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 5, spent: 0 } });
  const admin = (name: string): Command => ({
    name,
    adminOnly: true,
    price: 0,
    run: () => ({ ok: false, reply: '收费要写成钻石数，用法：/修改收费 2' }),
  });
  const commands = ['截图', '修改收费', '自动回复阈值', '自动谢礼'].map(admin);
  const { settle, say, prompts, sent } = setup({ wallet, admins: ['u-管理'], commands });
  say(chat('阿明', '@小助手 /修改收费 0'));
  say(chat('管理', '@小助手 /修改收费 两钻'));
  say(chat('管理', '@小助手 /删库'));
  await settle();

  expect(prompts).toEqual([]);
  expect(wallet.balance('u-阿明')).toBe(5);
  expect(sent).toEqual([
    '@管理 收费要写成钻石数，用法：/修改收费 2',
    '@管理 没有指令「删库」，可用的有：截图、修改收费、自动回复阈值、自动谢礼',
  ]);
});

test('anyone can run a public command at its own price, and a failed one is refunded', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 5, spent: 0 } });
  const ran: string[] = [];
  const commands: Command[] = [
    {
      name: '点歌',
      adminOnly: false,
      price: 2,
      run: (args) => {
        ran.push(args);
        return args ? { ok: true, reply: `已点歌：${args}` } : { ok: false, reply: '要写歌名' };
      },
    },
    {
      name: '清空',
      adminOnly: true,
      price: 0,
      run: () => ({ ok: true, reply: '已清空' }),
    },
  ];
  const { settle, say, sent } = setup({ wallet, admins: ['u-管理'], commands });
  say(chat('阿明', '@小助手 /点歌 晴天'));
  say(chat('阿明', '@小助手 /点歌'));
  say(chat('阿明', '@小助手 /清空'));
  say(chat('阿明', '@小助手 /点歌 稻香'));
  say(chat('阿明', '@小助手 /点歌 七里香'));
  await settle();

  // 5 diamonds: 晴天 (2), the empty one (2, refunded), 稻香 (2), then 1 left for 七里香.
  expect(ran).toEqual(['晴天', '', '稻香']);
  expect(wallet.balance('u-阿明')).toBe(1);
  expect(sent).toEqual([
    '@阿明 已点歌：晴天',
    '@阿明 要写歌名',
    '@阿明 没有指令「清空」，可用的有：点歌',
    '@阿明 已点歌：稻香',
    '@阿明 「点歌」要先给主播送礼：每次2钻，你送的还剩1钻（不另外扣钱），送了马上回你',
  ]);
});

test('a command with nothing to say says nothing', async () => {
  const wallet = memoryWallet({ 'u-管理': { nickname: '管理', gifted: 1, spent: 0 } });
  const commands: Command[] = [
    { name: '静音', adminOnly: false, price: 1, run: () => ({ ok: true, reply: '' }) },
  ];
  const { settle, say, sent } = setup({ wallet, commands });
  say(chat('管理', '@小助手 /静音'));
  await settle();

  expect(sent).toEqual([]);
  expect(wallet.balance('u-管理')).toBe(0);
});

test("/识歌 asks its own model with its own prompt, at a mention's price, answered like a mention", async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const asked: string[] = [];
  const songId = new SongId({
    prompt: () => '识歌:{{question}}',
    codex: ({ prompt }) => {
      asked.push(prompt);
      return Promise.resolve('这首是《aLIEz》');
    },
    log: silentLog,
  });
  const { settle, say, prompts, sent } = setup({ wallet, cost: 1, commands: songId.commands() });
  say(chat('阿明', '@小助手 /识歌 日文的'));
  say(chat('阿明', '@小助手 /识歌'));
  await settle();

  expect(asked).toEqual(['识歌:日文的']);
  expect(prompts).toEqual([]);
  expect(wallet.balance('u-阿明')).toBe(0);
  expect(sent).toEqual([
    '@阿明 「识歌」要先给主播送礼：每次1钻，你送的还剩0钻（不另外扣钱），送了马上回你',
    '@阿明 这首是《aLIEz》',
  ]);
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

test("what auto-reply picked for one of the room's own commands is answered with its prompt, charged, after a gift too", async () => {
  const wallet = memoryWallet();
  const { bot, settle, give, prompts, sent } = setup({
    wallet,
    cost: 1,
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
  expect(prompts).toEqual([]);

  give(gift('阿明', 1, 1));
  await settle();
  expect(prompts).toEqual(['歌单：晴天\n阿明 问的：虾虾会唱晴天吗']);
  expect(sent.at(-1)).toBe('@阿明 会唱哦，《晴天》在歌单里');
  expect(wallet.balance('u-阿明')).toBe(0);
});

test("a mention Claude finds asking for one of the room's own commands is asked again with its prompt, paid once", async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const answers = [
    JSON.stringify({ message: '我看看', command_request: 'can-sing', command_args: '' }),
    JSON.stringify({ message: '会唱哦，《晴天》在歌单里' }),
  ];
  const { say, settle, prompts, sent } = setup({
    wallet,
    cost: 1,
    ask: () => Promise.resolve(answers.shift()!),
    additionalCommands: [CAN_SING],
  });
  // Not the trigger's words, so it's the usual prompt that finds the command.
  say(chat('阿明', `@${BOT.nickname} 晴天在歌单里吗`));
  await settle();

  expect(prompts[1]).toBe('歌单：晴天\n阿明 问的：晴天在歌单里吗');
  expect(sent).toEqual(['@阿明 会唱哦，《晴天》在歌单里']);
  expect(wallet.balance('u-阿明')).toBe(0);
});

test('a free room command answers a viewer with no balance, without @ or with one (refunded)', async () => {
  const wallet = memoryWallet({ 'u-小红': { nickname: '小红', gifted: 1, spent: 0 } });
  const answers = [
    JSON.stringify({ message: '会唱哦，《晴天》在歌单里' }),
    JSON.stringify({ message: '我看看', command_request: 'can-sing', command_args: '' }),
    JSON.stringify({ message: '会唱哦，《晴天》在歌单里' }),
  ];
  const { bot, say, settle, sent } = setup({
    wallet,
    cost: 1,
    ask: () => Promise.resolve(answers.shift()!),
    additionalCommands: [{ ...CAN_SING, price: 0 }],
  });
  bot.replyUnprompted({
    nickname: '阿明',
    userId: 'u-阿明',
    question: '虾虾会唱晴天吗',
    heard: 'chat',
    command: 'can-sing',
  });
  await settle();
  expect(sent).toEqual(['@阿明 会唱哦，《晴天》在歌单里']);

  say(chat('小红', `@${BOT.nickname} 晴天在歌单里吗`));
  await settle();
  expect(sent.at(-1)).toBe('@小红 会唱哦，《晴天》在歌单里');
  expect(wallet.balance('u-小红')).toBe(1);
});

test("an admin-only room command that @s others: an admin's request @s each, a viewer's gets Claude's own reply", async () => {
  const OLD_SCORES: AdditionalCommand = {
    id: 'old-scores',
    name: '翻旧账',
    when: '主播要翻旧账',
    trigger: null,
    prompt: () => '{{asker}} 要：{{question}}',
    price: 0,
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

test("a mention matching a room command's trigger is answered with that command at its price, before any charge", async () => {
  const wallet = memoryWallet();
  const { say, settle, prompts, sent } = setup({
    wallet,
    cost: 1,
    answer: JSON.stringify({ message: '会唱哦，《晴天》在歌单里' }),
    additionalCommands: [{ ...CAN_SING, price: 0 }],
  });
  say(chat('阿明', `@${BOT.nickname} 虾会唱晴天吗`));
  await settle();

  expect(prompts).toEqual(['歌单：晴天\n阿明 问的：虾会唱晴天吗']);
  expect(sent).toEqual(['@阿明 会唱哦，《晴天》在歌单里']);
});

test("a mention a room command's trigger took is answered as usual, at the usual price, when the command says nothing", async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const answers = [JSON.stringify({ message: '' }), JSON.stringify({ message: '会生气的' })];
  const { say, settle, prompts, sent } = setup({
    wallet,
    cost: 1,
    template: '{{asker}}: {{question}}',
    ask: () => Promise.resolve(answers.shift()!),
    additionalCommands: [{ ...CAN_SING, price: 0 }],
  });
  say(chat('阿明', `@${BOT.nickname} 虾虾会唱完就生气吗`));
  await settle();

  expect(prompts).toEqual([
    '歌单：晴天\n阿明 问的：虾虾会唱完就生气吗',
    '阿明: 虾虾会唱完就生气吗',
  ]);
  expect(sent).toEqual(['@阿明 会生气的']);
  expect(wallet.balance('u-阿明')).toBe(0);
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

test('a room command with a fixed reply sends that text with no model asked, charged at its price, and the @ is not answered again', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 3, spent: 0 } });
  const info = jest.fn();
  const { say, settle, prompts, sent } = setup({
    wallet,
    cost: 2,
    log: { ...silentLog, info },
    additionalCommands: [{ ...FIXED, price: 1 }],
  });
  say(chat('阿明', `@${BOT.nickname} 你好呀`));
  await settle();

  expect(prompts).toEqual([]);
  expect(sent).toEqual(['@阿明 欢迎来到直播间！']);
  expect(wallet.balance('u-阿明')).toBe(2);
  expect(info).toHaveBeenCalledWith('fixed reply', { id: 'greet', asker: '阿明' });
});

test("a fixed reply is sent when auto-reply picks the command, and when Claude asks for it for an @ (the difference refunded, Claude's own words not sent)", async () => {
  const wallet = memoryWallet({
    'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 },
    'u-小红': { nickname: '小红', gifted: 3, spent: 0 },
  });
  const { bot, say, settle, prompts, sent } = setup({
    wallet,
    cost: 3,
    answer: JSON.stringify({ message: '我看看', command_request: 'greet', command_args: '' }),
    additionalCommands: [{ ...FIXED, price: 1 }],
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
  expect(wallet.balance('u-阿明')).toBe(0);

  say(chat('小红', `@${BOT.nickname} 问个好`));
  await settle();
  expect(prompts).toHaveLength(1);
  expect(sent.at(-1)).toBe('@小红 欢迎来到直播间！');
  expect(sent).toHaveLength(2);
  expect(wallet.balance('u-小红')).toBe(2);
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
  price: 1,
  ...filter,
});

test("a command's except filter skips a trigger-taken @ from a viewer it names: nothing is sent, asked or charged", async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 3, spent: 0 } });
  const info = jest.fn();
  const { say, settle, prompts, sent } = setup({
    wallet,
    cost: 2,
    log: { ...silentLog, info },
    additionalCommands: [FILTERED({ except: [{ badge: 'V' }, { badge: 'V年' }] })],
  });
  say(viewerChat('阿明', `@${BOT.nickname} 你好呀`, { badges: ['V年'] }));
  await settle();

  expect(prompts).toEqual([]);
  expect(sent).toEqual([]);
  expect(wallet.balance('u-阿明')).toBe(3);
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

test('a command filtered out for an @ that Claude asked it for is refunded in full and not answered', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 2, spent: 0 } });
  const { say, settle, prompts, sent } = setup({
    wallet,
    cost: 2,
    answer: JSON.stringify({ message: '我看看', command_request: 'greet', command_args: '' }),
    additionalCommands: [FILTERED({ only: [{ badge: 'V' }] })],
  });
  say(chat('阿明', `@${BOT.nickname} 问个好`));
  await settle();
  expect(prompts).toHaveLength(1);
  expect(sent).toEqual([]);
  expect(wallet.balance('u-阿明')).toBe(2);
});

test("what auto-reply picked is skipped for a viewer the filter excludes, and the streamer's speech matches only admin", async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const { bot, say, settle, prompts, sent } = setup({
    wallet,
    cost: 1,
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
  expect(wallet.balance('u-阿明')).toBe(1);

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
