import type { Judge, Log } from '../src/app/ports';
import { fakeRoom } from './fake-room';
import { Talker, WOKEN, type TalkerOptions } from '../src/app/talker';
import { ChatHistory } from '../src/core/chat-history';
import { Transcript } from '../src/core/transcript';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };

/** Scores a line about the bot (one with 机器人 in it) 0.9, anything else 0.1. */
const judgeByWord =
  (judged: string[]): Judge =>
  (state, questions) => {
    const fresh = state.split('新内容：\n')[1]!.split('\n');
    judged.push(...fresh);
    return Promise.resolve(
      Object.fromEntries(
        Object.keys(questions).map((key, i) => [key, fresh[i]!.includes('机器人') ? 0.9 : 0.1]),
      ),
    );
  };

/**
 * A talker whose every wait moves the clock on and then runs the next of `rounds` (what happens in
 * the room meanwhile), stopping once they run out.
 */
function setup(rounds: (() => void)[], options: Partial<TalkerOptions> = {}) {
  let now = 0;
  const transcript = new Transcript(Infinity, () => now);
  const history = new ChatHistory(100);
  const prompts: string[] = [];
  const sent: { kind: string; text: string }[] = [];
  const judged: string[] = [];
  const answers: string[] = [];
  const talker: Talker = new Talker({
    ask: ({ prompt }) => {
      prompts.push(prompt);
      return Promise.resolve(answers.shift() ?? '');
    },
    outbox: { push: (message) => sent.push(message) },
    promptTemplate: () => '{{question}}|{{transcript}}',
    judge: judgeByWord(judged),
    threshold: 0.6,
    room: fakeRoom({ history, transcript, now: () => now }),
    log: silentLog,
    sleep: (ms) => {
      now += ms;
      const round = rounds.shift();
      if (round) round();
      else talker.stop();
      return Promise.resolve();
    },
    ...options,
  });
  const chat = (nickname: string, content: string) => history.add({ ts: now, nickname, content });
  const say = (text: string) => transcript.add({ start: now - 2000, end: now, text, speech: 0.8 });
  return { talker, prompts, sent, judged, answers, chat, say };
}

test('asks Jev about what is new, waits for the room to react, then talks, and keeps quiet a while', async () => {
  const rounds = [
    () => chat('阿明', '今晚吃火锅'),
    () => chat('小红', '这机器人好笨啊'),
    // While it waits, the streamer reads it out and laughs.
    () => say('这机器人好笨啊哈哈哈'),
    // Too soon after it talked: looked at only once it has kept quiet a minute.
    () => chat('阿明', '机器人你几岁'),
    () => {},
    () => {},
    () => {},
  ];
  const { talker, prompts, sent, judged, answers, chat, say } = setup(rounds);
  answers.push(JSON.stringify({ reply: true, message: '我才不笨，我只是在省电' }));
  answers.push(JSON.stringify({ reply: true, message: '我刚出生两天' }));
  await talker.run();

  expect(judged).toEqual([
    '(1) 00:00:20 [阿明] 今晚吃火锅',
    '(1) 00:00:40 [小红] 这机器人好笨啊',
    '(1) 00:01:20 [阿明] 机器人你几岁',
  ]);
  expect(prompts[0]).toBe('有人说到你：小红 说「这机器人好笨啊」。|00:00:58 这机器人好笨啊哈哈哈');
  expect(sent).toEqual([
    { kind: 'talk', text: '我才不笨，我只是在省电' },
    { kind: 'talk', text: '我刚出生两天' },
  ]);
});

test('says nothing when, seeing how the room took it, there is no need to', async () => {
  const { talker, sent, answers, chat } = setup([() => chat('小红', '机器人你几岁了'), () => {}]);
  answers.push(JSON.stringify({ reply: false, message: '' }));
  await talker.run();

  expect(sent).toEqual([]);
});

test('asks Jev nothing at a threshold of 1 or more, until /自动回复阈值 lowers it', async () => {
  const rounds = [
    () => chat('小红', '机器人在吗'),
    () => {
      expect(run('自动回复阈值', '0.6')).toEqual({ ok: true, reply: '已处理自动回复阈值请求' });
      chat('小红', '机器人在吗在吗');
    },
  ];
  const { talker, judged, chat } = setup(rounds, { threshold: 1 });
  const run = (name: string, args: string) =>
    talker
      .commands()
      .find((command) => command.name === name)
      ?.run?.(args);
  await talker.run();

  // Only what was said after it was turned on.
  expect(judged).toEqual(['(1) 00:00:40 [小红] 机器人在吗在吗']);
  expect(run('自动回复阈值', '一半')).toEqual({
    ok: false,
    reply: '阈值要写成 0 到 1 之间的小数，1 表示关闭，用法：/自动回复阈值 0.6',
  });
  expect(talker.threshold).toBe(0.6);
});

test('the wake word talks now, telling Claude why, and an answer that is not JSON is sent as it is', async () => {
  const { talker, prompts, sent, answers } = setup([]);
  answers.push('主播今天好可爱');

  expect(await talker.talkNow('reply', WOKEN)).toBe('主播今天好可爱');
  expect(prompts).toEqual(['主播说了唤醒词。|（暂无）']);
  expect(sent).toEqual([{ kind: 'reply', text: '主播今天好可爱' }]);
});
