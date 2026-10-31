import type { SendHeart } from '../../../src/app/ports';
import { HeartGate } from '../../../src/app/tools/heart-gate';
import { heartTool } from '../../../src/app/tools/heart';
import { silentLog } from '../../support/fakes';

const context = { asker: '雅', question: '' };

test('sends one heart in silence and says how many diamonds are left', async () => {
  let sent = 0;
  const tool = heartTool(
    new HeartGate(() => Promise.resolve({ result: 'sent' as const, diamondsLeft: 10 - ++sent })),
    silentLog,
  );
  const answer = await tool.call({}, context);
  expect(sent).toBe(1);
  expect(answer.silent).toBe(true);
  expect(JSON.parse(answer.text)).toEqual({ sent: true, diamondsLeft: 9 });
});

test('is admin-only, /小心心 takes nothing after it and says nothing', () => {
  const tool = heartTool(
    new HeartGate(() => Promise.resolve({ result: 'sent', diamondsLeft: null })),
    silentLog,
  );
  expect(tool.adminOnly).toBe(true);
  const [command] = tool.commands!;
  expect(command!.name).toBe('小心心');
  expect(command!.parse(' ')).toEqual({ args: {} });
  expect(command!.parse('3')).toHaveProperty('usage');
  expect(command!.say({ text: '{}' }, {})).toBe('');
});

test('a room-feed that fails is an error result', async () => {
  const tool = heartTool(
    new HeartGate(() => Promise.reject(new Error('页面上没找到小心心'))),
    silentLog,
  );
  expect(await tool.call({}, context)).toEqual({
    text: '现在送不了小心心，请稍后再试',
    isError: true,
  });
});

test('too few diamonds: the bot says so itself, without the numbers, which go to the log', async () => {
  const logged: [string, object | undefined][] = [];
  const log = {
    ...silentLog,
    info: (message: string, meta?: object) => void logged.push([message, meta]),
  };
  const tool = heartTool(
    new HeartGate(() => Promise.resolve({ result: 'notEnough' as const, diamonds: 0, price: 1 })),
    log,
  );
  expect(await tool.call({}, context)).toEqual({
    text: JSON.stringify({ sent: false }),
    silent: true,
    say: '钻石不够送小心心',
  });
  expect(logged).toEqual([
    ['not enough diamonds for a heart', { asker: '雅', diamonds: 0, price: 1 }],
  ]);
});

/** A tool on a fake clock, whose room-feed answers `answers` in turn (sent, by default). */
function timed(answers: (() => ReturnType<SendHeart>)[] = []) {
  let time = 0;
  let calls = 0;
  const tool = heartTool(
    new HeartGate(
      () => answers[calls++]?.() ?? Promise.resolve({ result: 'sent', diamondsLeft: 9 }),
      () => time,
    ),
    silentLog,
  );
  return {
    tool,
    sends: () => calls,
    later: (ms: number) => void (time += ms),
  };
}

test('any other gift fails, for Claude to say why, sending nothing; a 小心心 or no gift named is sent', async () => {
  const { tool, sends } = timed();
  expect(await tool.call({ gift: '嘉年华' }, context)).toEqual({
    text: '只能送小心心，送不了嘉年华，这次什么都没送',
    isError: true,
  });
  expect(sends()).toBe(0);
  for (const gift of ['小心心', ' 心心 ', '']) {
    const { tool: fresh, sends: freshSends } = timed();
    expect((await fresh.call({ gift }, context)).isError).toBeUndefined();
    expect(freshSends()).toBe(1);
  }
});

test('one 小心心 in 4 minutes: sooner fails, for Claude to say how many minutes are left, sending nothing', async () => {
  const { tool, sends, later } = timed();
  await tool.call({}, context);
  later(60_000 + 1);
  expect(await tool.call({}, context)).toEqual({
    text: '小心心 4 分钟只能送一次，还要等 3 分钟，这次没送',
    isError: true,
  });
  later(3 * 60_000 - 2);
  expect((await tool.call({}, context)).text).toBe(
    '小心心 4 分钟只能送一次，还要等 1 分钟，这次没送',
  );
  expect(sends()).toBe(1);
  later(1);
  expect((await tool.call({}, context)).isError).toBeUndefined();
  expect(sends()).toBe(2);
});

test('an ask while one is sending waits its 4 minutes too', async () => {
  let finish = () => {};
  const { tool, sends } = timed([
    () => new Promise((resolve) => (finish = () => resolve({ result: 'sent', diamondsLeft: 9 }))),
  ]);
  const first = tool.call({}, context);
  expect((await tool.call({}, context)).text).toContain('4 分钟只能送一次');
  finish();
  await first;
  expect(sends()).toBe(1);
});

test('what was not sent (too few diamonds, a failure) does not count towards the 4 minutes', async () => {
  const { tool, sends } = timed([
    () => Promise.resolve({ result: 'notEnough', diamonds: 0, price: 1 }),
    () => Promise.reject(new Error('页面上没找到小心心')),
  ]);
  expect((await tool.call({}, context)).say).toBe('钻石不够送小心心');
  expect((await tool.call({}, context)).text).toBe('现在送不了小心心，请稍后再试');
  expect((await tool.call({}, context)).isError).toBeUndefined();
  expect(sends()).toBe(3);
});
