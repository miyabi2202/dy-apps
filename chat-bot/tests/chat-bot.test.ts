import type { DyhubChatPart, DyhubCommentEvent } from '@dy-apps/services';
import { ChatBot, type BotLog } from '../src/chat-bot';

const BOT = { nickname: '小助手', userId: 'bot-1' };
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

function setup(options: { answer?: string; historySize?: number; maxReplyLength?: number } = {}) {
  let onComment: (event: DyhubCommentEvent) => void = () => {};
  const prompts: string[] = [];
  const sent: string[] = [];
  const bot = new ChatBot({
    client: {
      onComment: (handler) => {
        onComment = handler;
        return () => {};
      },
      onStatus: () => () => {},
      connect: () => {},
      close: () => {},
    },
    bot: BOT,
    ask: (prompt) => {
      prompts.push(prompt);
      return Promise.resolve(options.answer ?? '你好呀');
    },
    send: (text) => {
      sent.push(text);
      return Promise.resolve({ echoed: true });
    },
    log: silentLog,
    promptTemplate: TEMPLATE,
    historySize: options.historySize,
    maxReplyLength: options.maxReplyLength,
  });
  bot.start();
  return { bot, say: (event: DyhubCommentEvent) => onComment(event), prompts, sent };
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
