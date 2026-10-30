import type { SendHeart } from '../../src/app/ports';
import { HEART_COOLDOWN_MS, HeartGate } from '../../src/app/tools/heart-gate';
import { happyHeartTool } from '../../src/mcp/happy-heart';
import { heartTool } from '../../src/mcp/heart';
import { silentLog } from '../support/fakes';

const context = { asker: '糖果🍬', question: '默认关闭你今天好可爱', admin: true };

/** Both heart tools on one gate, a fake clock, and room-feed answering `answer` (sent, by default). */
function setup(answer: SendHeart = () => Promise.resolve({ result: 'sent', diamondsLeft: 9 })) {
  let time = 0;
  let sends = 0;
  const logged: [string, object | undefined][] = [];
  const log = {
    ...silentLog,
    info: (message: string, meta?: object) => void logged.push([message, meta]),
  };
  const hearts = new HeartGate(
    () => {
      sends++;
      return answer();
    },
    () => time,
  );
  let on = true;
  const happy = happyHeartTool(hearts, { on: () => on, log });
  return {
    happy,
    asked: heartTool(hearts, log),
    logged,
    sends: () => sends,
    later: (ms: number) => void (time += ms),
    switchOff: () => void (on = false),
  };
}

test('sends one, tells Claude not to mention it, and logs why it was happy; never silent', async () => {
  const { happy, logged, sends } = setup();
  const answer = await happy.call({ why: '主播夸我可爱' }, context);
  expect(answer).toEqual({ text: '送出了一个小心心。回答里不用提这件事。' });
  expect(sends()).toBe(1);
  expect(logged).toEqual([
    ['happy heart', { asker: '糖果🍬', why: '主播夸我可爱', result: 'sent', diamondsLeft: 9 }],
  ]);
});

test('too soon, too few diamonds or a failure: nothing goes, nothing is said, Claude is told to keep quiet about it', async () => {
  const notSent = { text: '这次没送出去。回答里不要提这件事，也不要说原因。' };
  const soon = setup();
  await soon.happy.call({}, context);
  expect(await soon.happy.call({ why: '又开心了' }, context)).toEqual(notSent);
  expect(soon.sends()).toBe(1);
  expect(soon.logged.at(-1)).toEqual([
    'happy heart',
    { asker: '糖果🍬', why: '又开心了', result: 'tooSoon', waitMs: HEART_COOLDOWN_MS },
  ]);

  const poor = setup(() => Promise.resolve({ result: 'notEnough', diamonds: 0, price: 1 }));
  expect(await poor.happy.call({}, context)).toEqual(notSent);

  const broken = setup(() => Promise.reject(new Error('页面上没找到小心心')));
  expect(await broken.happy.call({}, context)).toEqual(notSent);
});

test('shares the 4 minutes with send_heart, both ways', async () => {
  const one = setup();
  await one.happy.call({}, context);
  expect((await one.asked.call({}, context)).text).toContain('4 分钟只能送一次');

  const other = setup();
  await other.asked.call({}, context);
  await other.happy.call({}, context);
  expect(other.sends()).toBe(1);
  other.later(HEART_COOLDOWN_MS);
  await other.happy.call({}, context);
  expect(other.sends()).toBe(2);
});

test('is for anyone, has no / command, and is offered only while /开心送心 is on', () => {
  const { happy, switchOff } = setup();
  expect(happy.adminOnly).toBeUndefined();
  expect(happy.commands).toBeUndefined();
  expect(happy.offered?.()).toBe(true);
  switchOff();
  expect(happy.offered?.()).toBe(false);
});
