import { GiftThanker } from '../../../src/app/replies/gift-thanker';
import type { Exchange, Log } from '../../../src/app/ports';
import { ChatHistory } from '../../../src/core/chat/chat-history';
import type { Gift } from '../../../src/core/chat/room-events';
import { fakeRoom } from '../../support/fake-room';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };
const MINUTE = 60_000;

function gift(nickname: string, name: string, diamonds: number): Gift {
  return { userId: `u-${nickname}`, nickname, name, count: 1, diamonds };
}

test('thanks a viewer once their gifts in 5 minutes pass the threshold, and again for what they send after', async () => {
  let now = 0;
  const prompts: string[] = [];
  const sent: { kind: string; text: string }[] = [];
  const exchanges: Exchange[] = [];
  const history = new ChatHistory(100);
  history.add({ ts: 1, userId: 'u-阿明', nickname: '阿明', content: '今天加班好累' });
  history.add({ ts: 2, userId: 'u-小红', nickname: '小红', content: '主播唱得好' });
  // Each wait for a combo to end lets the test send more gifts first.
  const waits: (() => void)[] = [];
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
    sleep: () => new Promise((resolve) => waits.push(resolve)),
  });

  thanker.onGift(gift('阿明', '玫瑰', 10));
  now += MINUTE;
  thanker.onGift(gift('阿明', '玫瑰', 10)); // 20: not more than the threshold
  now += 5 * MINUTE;
  thanker.onGift(gift('阿明', '玫瑰', 15)); // the first two fell out of the window: 15
  thanker.onGift(gift('阿明', '小心心', 10)); // 25: past it, waiting for the combo to end
  thanker.onGift(gift('阿明', '小心心', 30)); // the same combo
  expect(waits).toHaveLength(1);
  waits.shift()!();
  await thanker.idle();

  // What comes after the thanks counts afresh.
  thanker.onGift(gift('阿明', '比心兔兔', 15));
  expect(waits).toHaveLength(0);
  thanker.onGift(gift('阿明', '比心', 10)); // 25 again: thanked again
  waits.shift()!();
  await thanker.idle();

  thanker.threshold = 99999;
  now += 6 * MINUTE;
  thanker.onGift(gift('阿明', '玫瑰', 500)); // threshold raised
  await thanker.idle();

  expect(prompts).toEqual([
    '阿明|刚刚送了 玫瑰×1、小心心×2，一共 55 钻|今天加班好累|（暂无）',
    '阿明|刚刚送了 比心兔兔×1、比心×1，一共 25 钻|今天加班好累|（暂无）',
  ]);
  expect(sent).toHaveLength(2);
  expect(exchanges[0]).toEqual({
    nickname: '阿明',
    question: '（刚刚送了 玫瑰×1、小心心×2，一共 55 钻）',
    answer: '@阿明 谢谢阿明的玫瑰，加班辛苦啦',
  });
});

test('in a 私密 room, thanks the viewer by their id and the nickname they show', async () => {
  const sent: { kind: string; text: string }[] = [];
  const talked: [string, Exchange][] = [];
  const history = new ChatHistory(100);
  history.add({ ts: 1, userId: '111111-苦***-31', nickname: '苦***', content: '今天加班好累' });
  history.add({ ts: 2, userId: '111111-苦***-45', nickname: '苦***', content: '主播唱得好' });
  const thanker = new GiftThanker({
    ask: ({ prompt }) => Promise.resolve(prompt),
    outbox: { push: (message) => sent.push(message) },
    promptTemplate: () => '{{asker}}|{{userChat}}',
    threshold: 20,
    room: fakeRoom({ history }),
    userTalk: { add: (userId, exchange) => talked.push([userId, exchange]), recent: () => '' },
    log: silentLog,
    sleep: () => Promise.resolve(),
  });

  thanker.onGift({ ...gift('苦***', '玫瑰', 30), userId: '111111-苦***-31' });
  await thanker.idle();

  expect(sent).toEqual([{ kind: 'reply', text: '@苦*** 苦***|今天加班好累' }]);
  expect(talked.map(([userId, { nickname }]) => [userId, nickname])).toEqual([
    ['111111-苦***-31', '苦***'],
  ]);
});

test('tells Claude how long the thanks may be with the short @ a long nickname falls back to', async () => {
  const prompts: string[] = [];
  const thanker = new GiftThanker({
    ask: ({ prompt }) => {
      prompts.push(prompt);
      return Promise.resolve('谢谢');
    },
    outbox: { push: () => {} },
    promptTemplate: () => '{{singleLength}}',
    threshold: 20,
    room: fakeRoom(),
    maxLength: 20,
    log: silentLog,
    sleep: () => Promise.resolve(),
  });

  thanker.onGift(gift('这是一个很长的昵称', '玫瑰', 30));
  await thanker.idle();

  // 20, less `@这是一 `.
  expect(prompts).toEqual(['15']);
});

test('/自动谢礼 sets the threshold', async () => {
  const thanker = new GiftThanker({
    ask: () => Promise.resolve(''),
    outbox: { push: () => {} },
    promptTemplate: () => '',
    threshold: 99999,
    room: fakeRoom(),
    log: silentLog,
    sleep: () => Promise.resolve(),
  });
  const run = (args: string) => thanker.commands()[0]?.run?.(args);

  expect(await run('100')).toEqual({ ok: true, reply: '已处理自动谢礼请求' });
  expect(thanker.threshold).toBe(100);
  expect(await run('很多')).toEqual({ ok: false, reply: '阈值要写成钻石数，用法：/自动谢礼 100' });
  expect(thanker.threshold).toBe(100);
});
