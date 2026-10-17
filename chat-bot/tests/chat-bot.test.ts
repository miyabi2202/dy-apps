import { ChatLog } from '../src/adapters/chat-log-files';
import { Billing } from '../src/app/billing';
import { ChatBot } from '../src/app/chat-bot';
import { builtInCommands, type Command } from '../src/app/commands';
import { Outbox } from '../src/app/outbox';
import type { Log } from '../src/app/ports';
import type { Gift, IncomingChat } from '../src/core/room-events';
import { Transcript } from '../src/core/transcript';
import { Wallet, type Account } from '../src/core/wallet';

const BOT = { nickname: '小助手', userId: 'bot-1' };
const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);
const TEMPLATE = '{{history}}\n---\n{{asker}}: {{question}} ({{singleLength}})';

let nextId = 0;
function chat(
  nickname: string,
  content: string,
  mentions: IncomingChat['mentions'] = [],
): IncomingChat {
  nextId++;
  const userId = nickname === BOT.nickname ? BOT.userId : `u-${nickname}`;
  return { ts: nextId, userId, nickname, content, mentions };
}

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };

interface SetupOptions {
  answer?: string;
  historySize?: number;
  maxReplyLength?: number;
  template?: string;
  transcript?: Transcript;
  screenshot?: () => Promise<Uint8Array>;
  wallet?: Wallet;
  cost?: number;
  ask?: () => Promise<string>;
  chatLog?: ChatLog;
  admins?: string[];
  persona?: string;
  /** Instead of the built-in ones. */
  commands?: Command[];
}

/** A wallet kept in memory, starting from `accounts`. */
function memoryWallet(accounts: Record<string, Account> = {}) {
  return new Wallet({ load: () => structuredClone(accounts), save: () => {} });
}

function gift(nickname: string, count: number, diamondCount: number): Gift {
  return { userId: `u-${nickname}`, nickname, name: '玫瑰', count, diamonds: count * diamondCount };
}

function setup(options: SetupOptions = {}) {
  let onChat: (chat: IncomingChat) => void = () => {};
  let onGift: (gift: Gift) => void = () => {};
  const prompts: string[] = [];
  const sent: string[] = [];
  // Sends at once: spacing is the outbox's own test.
  const outbox = new Outbox({
    send: (text) => {
      sent.push(text);
      return Promise.resolve({ echoed: true });
    },
    log: silentLog,
    sleep: () => Promise.resolve(),
  });
  const images: (Uint8Array | undefined)[] = [];
  const billing = options.wallet && new Billing({ wallet: options.wallet, cost: options.cost });
  const persona = { value: options.persona ?? '' };
  const bot = new ChatBot({
    events: {
      onChat: (handler) => (onChat = handler),
      onGift: (handler) => (onGift = handler),
      onStatus: () => {},
      connect: () => {},
      close: () => {},
    },
    bot: BOT,
    ask: ({ prompt, image }) => {
      prompts.push(prompt);
      images.push(image);
      return options.ask ? options.ask() : Promise.resolve(options.answer ?? '你好呀');
    },
    outbox,
    log: silentLog,
    promptTemplate: options.template ?? TEMPLATE,
    transcript: options.transcript,
    screenshot: options.screenshot,
    now: () => NOW,
    billing,
    record: options.chatLog,
    admins: new Set(options.admins),
    persona,
    commands: options.commands ?? builtInCommands({ persona, billing }),
    historySize: options.historySize,
    maxReplyLength: options.maxReplyLength,
  });
  bot.start();
  return {
    bot,
    /** Waits for Claude's answers and for everything to be sent. */
    settle: async () => {
      await bot.idle();
      await outbox.idle();
    },
    say: (event: IncomingChat) => onChat(event),
    give: (event: Gift) => onGift(event),
    prompts,
    images,
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

test('passes only the most recent chats', async () => {
  const { settle, say, prompts } = setup({ historySize: 2 });
  for (const text of ['一', '二', '三']) say(chat('阿明', text));
  say(chat('小红', '@小助手 hi'));
  await settle();

  expect(prompts[0]).toBe('阿明: 二\n阿明: 三\n---\n小红: hi (45)');
});

test('ignores chat that does not mention the bot, and its own messages', async () => {
  const { settle, say, prompts } = setup();
  say(chat('阿明', '@别人 你好', [{ text: '@别人', userId: 'u-x' }]));
  say(chat('小助手', '@小助手 自己提到自己'));
  await settle();

  expect(prompts).toEqual([]);
});

test('matches a picked @mention by user id even when the nickname text differs', async () => {
  const { settle, say, prompts } = setup();
  say(chat('阿明', '@旧昵称 在吗', [{ text: '@旧昵称', userId: 'bot-1' }]));
  await settle();

  expect(prompts).toHaveLength(1);
});

test('puts the reply on one line and cuts it to the length limit', async () => {
  const { settle, say, sent } = setup({ answer: '  第一行\n第二行很长很长  ', maxReplyLength: 10 });
  say(chat('阿明', '@小助手 说说'));
  await settle();

  expect(sent).toEqual(['@阿明 第一行 第二']);
});

test('does not repeat the @ when Claude already starts with it', async () => {
  const { settle, say, sent } = setup({ answer: '@阿明 @阿明 等于2' });
  say(chat('阿明', '@小助手 1+1'));
  await settle();

  expect(sent).toEqual(['@阿明 等于2']);
});

test('drops the sources list web search adds', async () => {
  const { settle, say, sent } = setup({
    answer: '大约41.89万亲密度\n\nSources:\n- [jb51](https://jb51.net)',
  });
  say(chat('阿明', '@小助手 16级灯牌'));
  await settle();

  expect(sent).toEqual(['@阿明 大约41.89万亲密度']);
});

test('passes the last minutes of what the streamer (or a guest) said or sang, and a screenshot', async () => {
  const transcript = new Transcript(30 * 60_000, () => NOW);
  const said = (minutesAgo: number, text: string, speech = 0.8, host = true) => {
    const end = NOW - minutesAgo * 60_000;
    transcript.add({ start: end - 3000, end, text, speech, host });
  };
  said(8, '太早了');
  said(2, '吕布一开始是文官');
  said(1.75, '你那边卡了', 0.8, false);
  said(1.5, '寒江陪烟火', 0.05);
  said(1, '谢谢点赞');
  const frame = new Uint8Array([0xff, 0xd8]);
  const { settle, say, prompts, images } = setup({
    template: '{{now}}\n{{transcript}}',
    transcript,
    screenshot: () => Promise.resolve(frame),
  });
  say(chat('阿明', '@小助手 主播在讲什么'));
  await settle();

  expect(prompts).toEqual([
    '08:00:00\n07:57:57 吕布一开始是文官\n07:58:12 （连线）你那边卡了\n07:58:27 （唱）寒江陪烟火\n07:58:57 谢谢点赞',
  ]);
  expect(images).toEqual([frame]);
});

test('answers without a picture when the screenshot fails', async () => {
  const { settle, say, sent, images } = setup({
    screenshot: () => Promise.reject(new Error('房间未连接')),
  });
  say(chat('阿明', '@小助手 在吗'));
  await settle();

  expect(images).toEqual([undefined]);
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
  expect(sent).toEqual(['@阿明 你的余额不足，还剩0钻，每次@需要1钻（60秒内只提醒一次）']);
});

test('gives the diamond back when the mention cannot be answered', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const { settle, say, sent } = setup({
    wallet,
    ask: () => Promise.reject(new Error('claude timed out')),
  });
  say(chat('阿明', '@小助手 在吗'));
  await settle();

  expect(sent).toEqual([]);
  expect(wallet.balance('u-阿明')).toBe(1);
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

test('records chat and gifts, and points Claude at the record folder', async () => {
  let written = '';
  const chatLog = new ChatLog('/data/chat/1', {
    now: () => NOW,
    append: (_path, text) => (written += text),
  });
  const { settle, say, give, prompts } = setup({ chatLog, template: '{{chatDir}}' });
  give(gift('阿明', 2, 10));
  say(chat('阿明', '@小助手 记得我送了什么吗'));
  await settle();

  expect(written).toBe(
    '2026-10-16 08:00:00 [阿明#u-阿明](gift) 送出 玫瑰×2（20钻）\n' +
      '2026-10-16 08:00:00 [阿明#u-阿明](chat) @小助手 记得我送了什么吗\n',
  );
  expect(prompts).toEqual(['/data/chat/1']);
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

  expect(sent).toEqual(['@小红 你的余额不足，还剩0钻，每次@需要1钻（60秒内只提醒一次）']);
  finish('想好了');
  await settle();
  expect(sent).toEqual([
    '@小红 你的余额不足，还剩0钻，每次@需要1钻（60秒内只提醒一次）',
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
  const { settle, say, prompts, sent } = setup({ wallet, admins: ['u-管理'] });
  say(chat('阿明', '@小助手 /修改收费 0'));
  say(chat('管理', '@小助手 /修改收费 两钻'));
  say(chat('管理', '@小助手 /删库'));
  await settle();

  expect(prompts).toEqual([]);
  expect(wallet.balance('u-阿明')).toBe(5);
  expect(sent).toEqual([
    '@管理 收费要写成钻石数，用法：/修改收费 2',
    '@管理 没有指令「删库」，可用的有：修改人设、修改收费、回复、自动回复间隔',
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
    '@阿明 你的余额不足，还剩1钻，指令「点歌」需要2钻（60秒内只提醒一次）',
  ]);
});

test('admins can make the bot talk now and change how often it talks', async () => {
  const calls: string[] = [];
  const talker = {
    interval: 0,
    talkNow: () => {
      calls.push('talkNow');
      return Promise.resolve('主播今天好可爱');
    },
  };
  const persona = { value: '' };
  const { settle, say, sent } = setup({
    admins: ['u-管理'],
    commands: builtInCommands({ persona, talker }),
  });
  say(chat('管理', '@小助手 /回复'));
  say(chat('管理', '@小助手 /自动回复间隔 5'));
  say(chat('管理', '@小助手 /自动回复间隔 五'));
  say(chat('阿明', '@小助手 /回复'));
  await settle();

  expect(calls).toEqual(['talkNow']);
  expect(talker.interval).toBe(5 * 60_000);
  // /回复's message is the talker's own; the rest answer with a system message.
  expect(sent).toEqual([
    '@管理 已处理自动回复间隔请求',
    '@管理 间隔要写成分钟数，0 表示关闭，用法：/自动回复间隔 3',
  ]);
});
