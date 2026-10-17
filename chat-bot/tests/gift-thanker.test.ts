import { GiftThanker } from '../src/app/gift-thanker';
import type { Exchange, Log } from '../src/app/ports';
import { ChatHistory } from '../src/core/chat-history';
import type { Gift } from '../src/core/room-events';
import { fakeRoom } from './fake-room';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };
const MINUTE = 60_000;

function gift(nickname: string, name: string, diamonds: number): Gift {
  return { userId: `u-${nickname}`, nickname, name, count: 1, diamonds };
}

test('thanks a viewer once their gifts in 5 minutes pass the threshold, once a window', async () => {
  let now = 0;
  const prompts: string[] = [];
  const sent: { kind: string; text: string }[] = [];
  const exchanges: Exchange[] = [];
  const history = new ChatHistory(100);
  history.add({ ts: 1, userId: 'u-阿明', nickname: '阿明', content: '今天加班好累' });
  history.add({ ts: 2, userId: 'u-小红', nickname: '小红', content: '主播唱得好' });
  const thanker = new GiftThanker({
    ask: ({ prompt }) => {
      prompts.push(prompt);
      return Promise.resolve('谢谢阿明的玫瑰，加班辛苦啦');
    },
    outbox: { push: (message) => sent.push(message) },
    promptTemplate: () => '{{asker}}|{{question}}|{{userChat}}|{{userHistory}}',
    threshold: 20,
    room: fakeRoom({ history, now: () => now }),
    userTalk: { add: (_userId, exchange) => exchanges.push(exchange), recent: () => '' },
    log: silentLog,
  });

  thanker.onGift(gift('阿明', '玫瑰', 10));
  now += MINUTE;
  thanker.onGift(gift('阿明', '玫瑰', 10)); // 20: not more than the threshold
  now += 5 * MINUTE;
  thanker.onGift(gift('阿明', '玫瑰', 15)); // the first two fell out of the window: 15
  thanker.onGift(gift('阿明', '小心心', 10)); // 25: thanked
  thanker.onGift(gift('阿明', '小心心', 30)); // already thanked this window
  thanker.threshold = 99999;
  now += 6 * MINUTE;
  thanker.onGift(gift('阿明', '玫瑰', 500)); // threshold raised
  await thanker.idle();

  expect(prompts).toEqual(['阿明|刚刚送了 玫瑰×1、小心心×1，一共 25 钻|今天加班好累|（暂无）']);
  expect(sent).toEqual([{ kind: 'reply', text: '@阿明 谢谢阿明的玫瑰，加班辛苦啦' }]);
  expect(exchanges).toEqual([
    {
      nickname: '阿明',
      question: '（刚刚送了 玫瑰×1、小心心×1，一共 25 钻）',
      answer: '@阿明 谢谢阿明的玫瑰，加班辛苦啦',
    },
  ]);
});

test('/自动谢礼 sets the threshold', async () => {
  const thanker = new GiftThanker({
    ask: () => Promise.resolve(''),
    outbox: { push: () => {} },
    promptTemplate: () => '',
    threshold: 99999,
    room: fakeRoom(),
    log: silentLog,
  });
  const run = (args: string) => thanker.commands()[0]?.run?.(args);

  expect(await run('100')).toEqual({ ok: true, reply: '已处理自动谢礼请求' });
  expect(thanker.threshold).toBe(100);
  expect(await run('很多')).toEqual({ ok: false, reply: '阈值要写成钻石数，用法：/自动谢礼 100' });
  expect(thanker.threshold).toBe(100);
});
