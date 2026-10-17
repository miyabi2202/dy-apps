import type { Log } from '../src/app/ports';
import { fakeRoom } from './fake-room';
import { Talker } from '../src/app/talker';
import { ChatHistory } from '../src/core/chat-history';
import { Transcript } from '../src/core/transcript';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };
const MINUTE = 60_000;

test('says one message each interval from what is going on, and stays quiet in a quiet room', async () => {
  let now = 0;
  const transcript = new Transcript(Infinity, () => now);
  const history = new ChatHistory(100);
  const prompts: string[] = [];
  const sent: { kind: string; text: string }[] = [];
  const answers = ['主播这首歌唱得好有感觉，是原唱的调吗？\n\nSources:\n- x', '我也想吃火锅'];
  // Each wait is one interval: the room changes during it, then the talker wakes.
  const rounds = [
    () => transcript.add({ start: now - 3000, end: now, text: '寒江陪烟火', speech: 0.05 }),
    () => {}, // nothing said or chatted
    () => history.add({ ts: now, nickname: '阿明', content: '今晚吃火锅' }),
  ];
  let talker: Talker | null = null;
  talker = new Talker({
    ask: ({ prompt }) => {
      prompts.push(prompt);
      return Promise.resolve(answers.shift() ?? '');
    },
    outbox: { push: (message) => sent.push(message) },
    promptTemplate: () => '{{botName}}|{{transcript}}|{{history}}',
    intervalMs: 3 * MINUTE,
    room: fakeRoom({ history, transcript, now: () => now }),
    log: silentLog,
    sleep: (ms) => {
      now += ms;
      const round = rounds.shift();
      if (round) round();
      else talker?.stop();
      return Promise.resolve();
    },
  });
  await talker.run();

  expect(prompts).toEqual([
    '小助手|00:02:57 （唱）寒江陪烟火|（暂无）',
    // The sung line is over 5 minutes old by then.
    '小助手|（暂无）|阿明: 今晚吃火锅',
  ]);
  expect(sent).toEqual([
    { kind: 'talk', text: '主播这首歌唱得好有感觉，是原唱的调吗？' },
    { kind: 'talk', text: '我也想吃火锅' },
  ]);
});

test('talks at a new interval as soon as it changes, never at 0, and now when asked', async () => {
  let now = 0;
  const history = new ChatHistory(100);
  const sent: { kind: string; text: string }[] = [];
  const contexts = ['主播是猫猫', '主播今天生日'];
  const prompts: string[] = [];
  const sleeps: number[] = [];
  let finishSleep: () => void = () => {};
  const talker = new Talker({
    ask: ({ prompt }) => {
      prompts.push(prompt);
      return Promise.resolve(`第${prompts.length}句`);
    },
    outbox: { push: (message) => sent.push(message) },
    promptTemplate: () => '{{context}}',
    intervalMs: 0,
    room: fakeRoom({ history, context: () => contexts.shift() ?? '', now: () => now }),
    log: silentLog,
    // Each sleep waits until the test lets it end.
    sleep: (ms) => {
      sleeps.push(ms);
      return new Promise((resolve) => {
        finishSleep = () => {
          now += ms;
          history.add({ ts: now, nickname: '阿明', content: '在吗' });
          resolve();
        };
      });
    },
  });
  const running = talker.run();
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  // At 0 it doesn't wait on a timer at all.
  await tick();
  expect(sleeps).toEqual([]);
  // /回复 talks now, as a reply, whatever the interval; the context is read each time.
  expect(await talker.talkNow()).toBe('第1句');
  talker.interval = 3 * MINUTE;
  await tick();
  expect(sleeps).toEqual([3 * MINUTE]);
  finishSleep();
  await tick();
  talker.stop();
  await running;

  expect(prompts).toEqual([
    '关于这个直播间的背景资料：\n\n主播是猫猫',
    '关于这个直播间的背景资料：\n\n主播今天生日',
  ]);
  expect(sent).toEqual([
    { kind: 'reply', text: '第1句' },
    { kind: 'talk', text: '第2句' },
  ]);
});

test('/回复 talks now, and /自动回复间隔 sets the interval in minutes', async () => {
  const sent: { kind: string; text: string }[] = [];
  const talker = new Talker({
    ask: () => Promise.resolve('主播今天好可爱'),
    outbox: { push: (message) => sent.push(message) },
    promptTemplate: () => '',
    intervalMs: 0,
    room: fakeRoom(),
    log: silentLog,
  });
  const run = (name: string, args: string) =>
    talker
      .commands()
      .find((command) => command.name === name)
      ?.run?.(args);

  expect(await run('回复', '')).toEqual({ ok: true, reply: '' });
  expect(sent).toEqual([{ kind: 'reply', text: '主播今天好可爱' }]);
  expect(await run('自动回复间隔', '5')).toEqual({ ok: true, reply: '已处理自动回复间隔请求' });
  expect(talker.interval).toBe(5 * MINUTE);
  expect(await run('自动回复间隔', '五')).toEqual({
    ok: false,
    reply: '间隔要写成分钟数，0 表示关闭，用法：/自动回复间隔 3',
  });
  expect(talker.interval).toBe(5 * MINUTE);
});
