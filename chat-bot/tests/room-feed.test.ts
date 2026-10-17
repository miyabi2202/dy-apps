import { ChatLog } from '../src/adapters/chat-log-files';
import { Billing } from '../src/app/billing';
import { RoomFeed } from '../src/app/room-feed';
import { ChatHistory } from '../src/core/chat-history';
import type { ChatLine, Gift } from '../src/core/room-events';
import { BOT, NOW, chat, fakeEvents, gift, memoryWallet, silentLog } from './fakes';

function setup(
  options: {
    historySize?: number;
    chatLog?: ChatLog;
    wallet?: ReturnType<typeof memoryWallet>;
  } = {},
) {
  const { events, say, give } = fakeEvents();
  const history = new ChatHistory(options.historySize ?? 100);
  const feed = new RoomFeed({
    events,
    bot: BOT,
    history,
    log: silentLog,
    record: options.chatLog,
    billing: options.wallet && new Billing({ wallet: options.wallet }),
  });
  const mentions: { asker: string; question: string; history: ChatLine[] }[] = [];
  const gifts: Gift[] = [];
  feed.onMention((from, question) =>
    mentions.push({ asker: from.nickname, question, history: history.recent() }),
  );
  feed.onGift((given) => gifts.push(given));
  feed.start();
  return { say, give, history, mentions, gifts };
}

test('tells the subscriber of an @mention with its question, and the chat before it', () => {
  const { say, mentions } = setup();
  say(chat('阿明', '主播好'));
  say(chat('阿明', '@小助手 这题怎么做', [{ text: '@小助手', userId: 'bot-1' }]));

  expect(mentions).toEqual([
    {
      asker: '阿明',
      question: '这题怎么做',
      history: [expect.objectContaining({ content: '主播好' })],
    },
  ]);
});

test('ignores chat that does not mention the bot, and its own messages', () => {
  const { say, mentions } = setup();
  say(chat('阿明', '@别人 你好', [{ text: '@别人', userId: 'u-x' }]));
  say(chat('小助手', '@小助手 自己提到自己'));

  expect(mentions).toEqual([]);
});

test('matches a picked @mention by user id even when the nickname text differs', () => {
  const { say, mentions } = setup();
  say(chat('阿明', '@旧昵称 在吗', [{ text: '@旧昵称', userId: 'bot-1' }]));

  expect(mentions).toHaveLength(1);
});

test('keeps only the most recent chats, mentions included once they have been handed out', () => {
  const { say, history, mentions } = setup({ historySize: 2 });
  for (const text of ['一', '二', '三']) say(chat('阿明', text));
  say(chat('小红', '@小助手 hi'));

  expect(mentions[0]?.history.map((line) => line.content)).toEqual(['二', '三']);
  expect(history.recent().map((line) => line.content)).toEqual(['三', '@小助手 hi']);
});

test('records chat and gifts', () => {
  let written = '';
  const chatLog = new ChatLog('/data/chat/1', {
    now: () => NOW,
    append: (_path, text) => (written += text),
  });
  const { say, give } = setup({ chatLog });
  give(gift('阿明', 2, 10));
  say(chat('阿明', '@小助手 记得我送了什么吗'));

  expect(written).toBe(
    '2026-10-16 08:00:00 [阿明#u-阿明](gift) 送出 玫瑰×2（20钻）\n' +
      '2026-10-16 08:00:00 [阿明#u-阿明](chat) @小助手 记得我送了什么吗\n',
  );
});

test('credits gifts to their givers, and passes on those worth diamonds', () => {
  const wallet = memoryWallet();
  const { give, gifts } = setup({ wallet });
  give(gift('阿明', 3, 1));
  give(gift('阿明', 1, 0));

  expect(wallet.balance('u-阿明')).toBe(3);
  expect(gifts).toEqual([gift('阿明', 3, 1)]);
});
