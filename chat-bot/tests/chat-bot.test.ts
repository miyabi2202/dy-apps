import { Billing } from '../src/app/billing';
import { ChatBot } from '../src/app/chat-bot';
import type { Command } from '../src/app/command';
import { MentionAnswerer, type Mention } from '../src/app/mention-answerer';
import { RoomFeed } from '../src/app/room-feed';
import { personaCommand } from '../src/app/room-state';
import { SongId } from '../src/app/song-id';
import { solveCommand } from '../src/app/solve-command';
import { MESSAGE_SCHEMA } from '../src/core/mention-answer';
import type { Question } from '../src/app/ports';
import { ChatHistory } from '../src/core/chat-history';
import { Wallet, type Account } from '../src/core/wallet';
import { fakeRoom } from './fake-room';
import { BOT, chat, fakeEvents, fakeOutbox, gift, memoryWallet, silentLog } from './fakes';

const TEMPLATE = '{{history}}\n---\n{{asker}}: {{question}} ({{singleLength}})';

interface SetupOptions {
  answer?: string;
  historySize?: number;
  template?: string;
  wallet?: Wallet;
  cost?: number;
  ask?: () => Promise<string>;
  admins?: string[];
  persona?: string;
  /** Instead of changing the persona and (with a wallet) the price. */
  commands?: Command[];
  /** Instead of the real answerer. */
  answerer?: Pick<MentionAnswerer, 'ask' | 'idle'>;
  now?: () => number;
  screenshot?: boolean;
}

/** The whole bot on fake events, Claude and outbox; mentions are answered by the real answerer. */
function setup(options: SetupOptions = {}) {
  const { events, say, give } = fakeEvents();
  const prompts: string[] = [];
  const { outbox, sent } = fakeOutbox();
  const history = new ChatHistory(options.historySize ?? 100);
  const room = fakeRoom({
    history,
    persona: options.persona,
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
      log: silentLog,
      promptTemplate: () => options.template ?? TEMPLATE,
      billing,
      onCommandRequest: (mention, name, args) => bot.requestCommand(mention, name, args),
    });
  const feed = new RoomFeed({ events, bot: BOT, history, log: silentLog, billing });
  const bot: ChatBot = new ChatBot({
    feed,
    answerer,
    room,
    outbox,
    log: silentLog,
    billing,
    admins: new Set(options.admins),
    commands: options.commands ?? [personaCommand(room), ...(billing?.commands() ?? [])],
    now: options.now,
    adminNames: '雅',
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
  };
}

test('passes only the most recent chats', async () => {
  const { settle, say, prompts } = setup({ historySize: 2 });
  for (const text of ['一', '二', '三']) say(chat('阿明', text));
  say(chat('小红', '@小助手 hi'));
  await settle();

  expect(prompts[0]).toBe('阿明: 二\n阿明: 三\n---\n小红: hi (45)');
});

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

test('unpaid mentions nobody came back for are dropped once they are 5 minutes old', async () => {
  let now = 0;
  const { bot, settle, say } = setup({ wallet: memoryWallet(), cost: 1, now: () => now });
  // The map is private: its size is all there is to see, since an old one is ignored anyway.
  const unpaid = (bot as unknown as { unpaid: Map<string, unknown> }).unpaid;
  say(chat('阿明', '@小助手 在吗'));
  say(chat('小红', '@小助手 在吗'));
  await settle();
  expect(unpaid.size).toBe(2);

  now = 5 * 60_000 + 1;
  say(chat('小蓝', '@小助手 在吗'));
  await settle();
  expect([...unpaid.keys()]).toEqual(['u-小蓝']);
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
    '阿明 没有 @ 你，是在弹幕里说到了你或在跟你说话，你主动回 TA 一句：机器人几岁',
  ]);
  expect(sent).toEqual(['@阿明 你好呀']);
  expect(wallet.balance('u-阿明')).toBe(0);
});

test('an unprompted answer is one message, cut to fit', async () => {
  const { bot, settle, sent } = setup({ answer: '好'.repeat(80) });
  bot.replyUnprompted({
    nickname: '阿明',
    userId: 'u-阿明',
    question: '机器人几岁',
    heard: 'chat',
  });
  await settle();

  expect(sent).toHaveLength(1);
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
    '主播 虾虾 没有 @ 你，是在直播里说到了你（语音识别，可能有错字），你主动回 TA 一句：机器人说两句',
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
    '阿明 没有 @ 你，是在弹幕里说到了你或在跟你说话，你主动回 TA 一句：机器人几岁',
  ]);
  expect(sent.at(-1)).toBe('@阿明 你好呀');
});

test('asked in words for an admin-only command, an admin has it run, as if typed', async () => {
  const answer = JSON.stringify({
    message: '好的，马上变猫',
    command_request: '修改人设',
    command_args: '爱说冷笑话的猫',
  });
  const { settle, say, sent, room } = setup({ answer, admins: ['u-雅'] });
  say(chat('雅', '@小助手 把你的人设改成爱说冷笑话的猫'));
  await settle();

  expect(room.persona).toBe('爱说冷笑话的猫');
  expect(sent).toEqual(['@雅 已处理修改人设请求']);
});

test('anyone else asking for an admin-only command is told who may', async () => {
  const answer = JSON.stringify({
    message: '好的，马上变猫',
    command_request: '修改人设',
    command_args: '猫',
  });
  const { settle, say, sent, room } = setup({ answer, admins: ['u-雅'] });
  say(chat('阿明', '@小助手 把你的人设改成猫'));
  await settle();

  expect(room.persona).toBe('');
  expect(sent).toEqual(['@阿明 你无权调用「修改人设」指令，只有主播和雅才可以']);
});

test("a command that isn't admin-only, or isn't one, gets Claude's reply instead", async () => {
  const answer = JSON.stringify({
    message: '想知道歌名就发 /识歌',
    command_request: '识歌',
    command_args: '',
  });
  const songId = { name: '识歌', adminOnly: false, run: () => ({ ok: true, reply: '' }) };
  const { settle, say, sent } = setup({ answer, commands: [songId] });
  say(chat('阿明', '@小助手 这是什么歌'));
  await settle();

  expect(sent).toEqual(['@阿明 想知道歌名就发 /识歌']);
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

test('clearing the wallet forgets every balance', () => {
  const saved: Record<string, Account>[] = [];
  const wallet = new Wallet({
    load: () => ({ 'u-阿明': { nickname: '阿明', gifted: 5, spent: 1 } }),
    save: (accounts) => saved.push(structuredClone(accounts)),
  });
  wallet.clear();

  expect(wallet.balance('u-阿明')).toBe(0);
  expect(saved).toEqual([{}]);
});

test('a low-balance notice goes out while Claude is still answering someone else', async () => {
  let finish: (answer: string) => void = () => {};
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const { settle, say, sent } = setup({
    wallet,
    ask: () => new Promise((resolve) => (finish = resolve)),
  });
  say(chat('阿明', '@小助手 慢慢想'));
  say(chat('小红', '@小助手 我没钱'));
  await new Promise((resolve) => setTimeout(resolve, 0));

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

test('an admin changes the persona and the price, each confirmed with a system message', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 2, spent: 0 } });
  const { settle, say, prompts, sent } = setup({
    wallet,
    admins: ['u-管理'],
    persona: '数学老师',
    template: '{{persona}}|{{question}}',
  });
  say(chat('管理', '@小助手 第一问'));
  say(chat('管理', '@小助手/修改人设 爱讲冷笑话的小猫'));
  say(chat('管理', '@小助手 /修改收费\u30002'));
  say(chat('阿明', '@小助手 第二问'));
  await settle();

  // Admins ask for free; 阿明's 2 diamonds now pay for one mention.
  expect(prompts).toEqual(['你的人设是数学老师|第一问', '你的人设是爱讲冷笑话的小猫|第二问']);
  expect(wallet.balance('u-阿明')).toBe(0);
  // Commands take effect at once; the answers wait for Claude.
  expect(sent).toEqual([
    '@管理 已处理修改人设请求',
    '@管理 已处理修改收费请求',
    '@管理 你好呀',
    '@阿明 你好呀',
  ]);
});

test('ignores commands from anyone but an admin, and answers bad ones with how to use them', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 5, spent: 0 } });
  const admin = (name: string): Command => ({
    name,
    adminOnly: true,
    price: 0,
    run: () => ({ ok: false, reply: '收费要写成钻石数，用法：/修改收费 2' }),
  });
  const commands = ['修改人设', '修改收费', '自动回复阈值', '自动谢礼'].map(admin);
  const { settle, say, prompts, sent } = setup({ wallet, admins: ['u-管理'], commands });
  say(chat('阿明', '@小助手 /修改收费 0'));
  say(chat('管理', '@小助手 /修改收费 两钻'));
  say(chat('管理', '@小助手 /删库'));
  await settle();

  expect(prompts).toEqual([]);
  expect(wallet.balance('u-阿明')).toBe(5);
  expect(sent).toEqual([
    '@管理 收费要写成钻石数，用法：/修改收费 2',
    '@管理 没有指令「删库」，可用的有：修改人设、修改收费、自动回复阈值、自动谢礼',
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
    claude: ({ prompt }) => {
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
