import type { DyhubChatPart, DyhubCommentEvent, DyhubGiftEvent } from '@dy-apps/services';
import { ChatBot, type BotLog } from '../src/chat-bot';
import { ChatLog } from '../src/chat-log';
import { Transcript } from '../src/transcript';
import { Wallet, type Account } from '../src/wallet';

const BOT = { nickname: '小助手', userId: 'bot-1' };
const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);
const TEMPLATE = '{{history}}\n---\n{{asker}}: {{question}} ({{maxLength}})';

let nextId = 0;
function chat(nickname: string, content: string, parts?: DyhubChatPart[]): DyhubCommentEvent {
  nextId++;
  return {
    id: `m${nextId}`,
    roomId: '1',
    type: 'chat',
    ts: nextId,
    user: { id: nickname === BOT.nickname ? BOT.userId : `u-${nickname}`, nickname },
    data: { content, parts },
  };
}

const silentLog: BotLog = { debug() {}, info() {}, warn() {}, error() {} };

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
}

/** A wallet kept in memory, starting from `accounts`. */
function memoryWallet(accounts: Record<string, Account> = {}) {
  return new Wallet({ load: () => structuredClone(accounts), save: () => {} });
}

function gift(nickname: string, diamondCount: number): DyhubGiftEvent {
  nextId++;
  return {
    id: `g${nextId}`,
    roomId: '1',
    type: 'gift',
    ts: nextId,
    user: { id: `u-${nickname}`, nickname },
    data: { giftId: 'rose', giftName: '玫瑰', diamondCount },
  };
}

function setup(options: SetupOptions = {}) {
  let onComment: (event: DyhubCommentEvent) => void = () => {};
  let onGift: (event: DyhubGiftEvent, newGifts: number) => void = () => {};
  const prompts: string[] = [];
  const images: (Uint8Array | undefined)[] = [];
  const sent: string[] = [];
  const bot = new ChatBot({
    client: {
      onComment: (handler) => {
        onComment = handler;
        return () => {};
      },
      onGift: (handler) => {
        onGift = handler;
        return () => {};
      },
      onStatus: () => () => {},
      connect: () => {},
      close: () => {},
    },
    bot: BOT,
    ask: ({ prompt, image }) => {
      prompts.push(prompt);
      images.push(image);
      return options.ask ? options.ask() : Promise.resolve(options.answer ?? '你好呀');
    },
    send: (text) => {
      sent.push(text);
      return Promise.resolve({ echoed: true });
    },
    log: silentLog,
    promptTemplate: options.template ?? TEMPLATE,
    transcript: options.transcript,
    screenshot: options.screenshot,
    now: () => NOW,
    wallet: options.wallet,
    chatLog: options.chatLog,
    cost: options.cost,
    historySize: options.historySize,
    maxReplyLength: options.maxReplyLength,
  });
  bot.start();
  return {
    bot,
    say: (event: DyhubCommentEvent) => onComment(event),
    give: (event: DyhubGiftEvent, count = 1) => onGift(event, count),
    prompts,
    images,
    sent,
  };
}

test('answers an @mention with the chat before it, and replies to the asker', async () => {
  const { bot, say, prompts, sent } = setup();
  say(chat('阿明', '主播好'));
  say(chat('小红', '今天讲什么'));
  say(chat('阿明', '@小助手 这题怎么做', [{ type: 'mention', text: '@小助手', userId: 'bot-1' }]));
  await bot.idle();

  expect(prompts).toEqual(['阿明: 主播好\n小红: 今天讲什么\n---\n阿明: 这题怎么做 (45)']);
  expect(sent).toEqual(['@阿明 你好呀']);
});

test('passes only the most recent chats', async () => {
  const { bot, say, prompts } = setup({ historySize: 2 });
  for (const text of ['一', '二', '三']) say(chat('阿明', text));
  say(chat('小红', '@小助手 hi'));
  await bot.idle();

  expect(prompts[0]).toBe('阿明: 二\n阿明: 三\n---\n小红: hi (45)');
});

test('ignores chat that does not mention the bot, and its own messages', async () => {
  const { bot, say, prompts } = setup();
  say(chat('阿明', '@别人 你好', [{ type: 'mention', text: '@别人', userId: 'u-x' }]));
  say(chat('小助手', '@小助手 自己提到自己'));
  await bot.idle();

  expect(prompts).toEqual([]);
});

test('matches a picked @mention by user id even when the nickname text differs', async () => {
  const { bot, say, prompts } = setup();
  say(chat('阿明', '@旧昵称 在吗', [{ type: 'mention', text: '@旧昵称', userId: 'bot-1' }]));
  await bot.idle();

  expect(prompts).toHaveLength(1);
});

test('puts the reply on one line and cuts it to the length limit', async () => {
  const { bot, say, sent } = setup({ answer: '  第一行\n第二行很长很长  ', maxReplyLength: 10 });
  say(chat('阿明', '@小助手 说说'));
  await bot.idle();

  expect(sent).toEqual(['@阿明 第一行 第二']);
});

test('does not repeat the @ when Claude already starts with it', async () => {
  const { bot, say, sent } = setup({ answer: '@阿明 @阿明 等于2' });
  say(chat('阿明', '@小助手 1+1'));
  await bot.idle();

  expect(sent).toEqual(['@阿明 等于2']);
});

test('drops the sources list web search adds', async () => {
  const { bot, say, sent } = setup({
    answer: '大约41.89万亲密度\n\nSources:\n- [jb51](https://jb51.net)',
  });
  say(chat('阿明', '@小助手 16级灯牌'));
  await bot.idle();

  expect(sent).toEqual(['@阿明 大约41.89万亲密度']);
});

test('passes the last minutes of what the streamer said, and a screenshot', async () => {
  const transcript = new Transcript(30 * 60_000, () => NOW);
  const said = (minutesAgo: number, text: string) => {
    const end = NOW - minutesAgo * 60_000;
    transcript.add({ start: end - 3000, end, text, bgm: false, emotion: null });
  };
  said(8, '太早了');
  said(2, '吕布一开始是文官');
  said(1, '谢谢点赞');
  const frame = new Uint8Array([0xff, 0xd8]);
  const { bot, say, prompts, images } = setup({
    template: '{{now}}\n{{transcript}}',
    transcript,
    screenshot: () => Promise.resolve(frame),
  });
  say(chat('阿明', '@小助手 主播在讲什么'));
  await bot.idle();

  expect(prompts).toEqual(['08:00:00\n07:57:57 吕布一开始是文官\n07:58:57 谢谢点赞']);
  expect(images).toEqual([frame]);
});

test('answers without a picture when the screenshot fails', async () => {
  const { bot, say, sent, images } = setup({
    screenshot: () => Promise.reject(new Error('房间未连接')),
  });
  say(chat('阿明', '@小助手 在吗'));
  await bot.idle();

  expect(images).toEqual([undefined]);
  expect(sent).toEqual(['@阿明 你好呀']);
});

test('gifts pay for mentions: each one costs the set price', async () => {
  const wallet = memoryWallet();
  const { bot, say, give, prompts, sent } = setup({ wallet, cost: 2 });
  give(gift('阿明', 1), 3);
  say(chat('阿明', '@小助手 第一问'));
  await bot.idle();

  expect(prompts).toHaveLength(1);
  expect(sent).toEqual(['@阿明 你好呀']);
  expect(wallet.balance('u-阿明')).toBe(1);
});

test('tells a viewer who cannot pay, once a minute, without asking Claude', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 1 } });
  const { bot, say, prompts, sent } = setup({ wallet, cost: 1 });
  say(chat('阿明', '@小助手 第一问'));
  say(chat('阿明', '@小助手 第二问'));
  await bot.idle();

  expect(prompts).toEqual([]);
  expect(sent).toEqual(['@阿明 你的余额不足，每次@需要1钻（60秒内只提醒一次）']);
});

test('gives the diamond back when the mention cannot be answered', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const { bot, say, sent } = setup({
    wallet,
    ask: () => Promise.reject(new Error('claude timed out')),
  });
  say(chat('阿明', '@小助手 在吗'));
  await bot.idle();

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
  const { bot, say, give, prompts } = setup({ chatLog, template: '{{chatDir}}' });
  give(gift('阿明', 10), 2);
  say(chat('阿明', '@小助手 记得我送了什么吗'));
  await bot.idle();

  expect(written).toBe(
    '2026-10-16 08:00:00 [阿明#u-阿明](gift) 送出 玫瑰×2（20钻）\n' +
      '2026-10-16 08:00:00 [阿明#u-阿明](chat) @小助手 记得我送了什么吗\n',
  );
  expect(prompts).toEqual(['/data/chat/1']);
});

test('a low-balance notice goes out while Claude is still answering someone else', async () => {
  let finish: (answer: string) => void = () => {};
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 0 } });
  const { bot, say, sent } = setup({
    wallet,
    ask: () => new Promise((resolve) => (finish = resolve)),
  });
  say(chat('阿明', '@小助手 慢慢想'));
  say(chat('小红', '@小助手 我没钱'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(sent).toEqual(['@小红 你的余额不足，每次@需要1钻（60秒内只提醒一次）']);
  finish('想好了');
  await bot.idle();
  expect(sent).toEqual(['@小红 你的余额不足，每次@需要1钻（60秒内只提醒一次）', '@阿明 想好了']);
});
