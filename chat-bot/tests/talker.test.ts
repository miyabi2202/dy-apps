import type { Judge, Log } from '../src/app/ports';
import { fakeRoom } from './fake-room';
import { Talker, WOKEN, type TalkerOptions } from '../src/app/talker';
import type { UnpromptedReply } from '../src/app/chat-bot';
import { OutOfCreditError } from '../src/core/errors';
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
  const chat = (nickname: string, content: string, userId?: string) =>
    history.add({ ts: now, nickname, content, ...(userId && { userId }) });
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
  const { talker, prompts, sent, judged, answers, chat, say } = setup(rounds, {
    reactionMs: 10_000,
  });
  answers.push(JSON.stringify({ reply: true, message: '我才不笨，我只是在省电' }));
  answers.push(JSON.stringify({ reply: true, message: '我刚出生两天' }));
  await talker.run();

  expect(judged).toEqual([
    '(1) 00:00:20 [阿明] 今晚吃火锅',
    '(1) 00:00:40 [小红] 这机器人好笨啊',
    '(1) 00:01:10 [阿明] 机器人你几岁',
  ]);
  expect(prompts[0]).toBe('有人说到你：小红 说「这机器人好笨啊」。|00:00:48 这机器人好笨啊哈哈哈');
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

test('when Jev runs out of money, says so in the room and turns itself off', async () => {
  let asked = 0;
  const { talker, sent, chat } = setup(
    [() => chat('小红', '机器人在吗'), () => chat('小红', '机器人还在吗'), () => {}],
    {
      judge: () => {
        asked++;
        return Promise.reject(new OutOfCreditError('jev answered 402: insufficient credits'));
      },
    },
  );
  await talker.run();

  expect(sent).toEqual([{ kind: 'system', text: '钱包烧干了，自动回复已关闭' }]);
  expect(talker.threshold).toBe(10);
  expect(asked).toBe(1);
});

test('with a picker, answers each one it picks like a mention, the streamer by their uid', async () => {
  const picks: string[] = [];
  const replies: UnpromptedReply[] = [];
  const { talker, sent, chat, say } = setup(
    [
      () => {
        chat('阿明', '今晚吃火锅', 'u-阿明');
        chat('小红', '机器人你几岁了', 'u-小红');
      },
      () => say('机器人你也说两句'),
    ],
    {
      picker: ({ prompt }) => {
        picks.push(prompt);
        return Promise.resolve(JSON.stringify({ lines: [2, 3, 2, 9] }));
      },
      pickTemplate: () => '{{botName}}\n{{lines}}',
      reply: (target) => void replies.push(target),
      streamer: () => ({ uid: 's-1', nickname: '虾虾' }),
      reactionMs: 10_000,
    },
  );
  await talker.run();

  expect(picks[0]).toContain('(1)  00:00:20 [阿明] 今晚吃火锅');
  expect(picks[0]).toContain('(2)★ 00:00:20 [小红] 机器人你几岁了');
  expect(picks[0]).toContain('(3)  00:00:30 [主播] 机器人你也说两句');
  expect(replies).toEqual([
    { nickname: '小红', userId: 'u-小红', question: '机器人你几岁了', heard: 'chat' },
    { nickname: '虾虾', userId: 's-1', question: '机器人你也说两句', heard: 'speech' },
  ]);
  expect(sent).toEqual([]);
});

test('the picker may answer nobody, and gets no streamer line while the streamer is unknown', async () => {
  const picks: string[] = [];
  const replies: UnpromptedReply[] = [];
  const { talker, chat, say } = setup(
    [() => chat('小红', '机器人你几岁了', 'u-小红'), () => say('机器人你也说两句')],
    {
      picker: ({ prompt }) => {
        picks.push(prompt);
        return Promise.resolve(JSON.stringify({ lines: [] }));
      },
      pickTemplate: () => '{{lines}}',
      reply: (target) => void replies.push(target),
      streamer: () => null,
      reactionMs: 10_000,
    },
  );
  await talker.run();

  expect(picks[0]).toContain('     00:00:30 [主播] 机器人你也说两句');
  expect(picks[0]).not.toContain('(2)');
  expect(replies).toEqual([]);
});

test('by default, picks whom to answer at once, without waiting for the room to react', async () => {
  const replies: UnpromptedReply[] = [];
  let picked = 0;
  const { talker, chat } = setup([() => chat('小红', '机器人你几岁了', 'u-小红')], {
    picker: () => {
      picked = 1;
      return Promise.resolve(JSON.stringify({ lines: [1] }));
    },
    pickTemplate: () => '{{lines}}',
    reply: (target) => void replies.push(target),
    streamer: () => null,
  });
  await talker.run();

  expect(picked).toBe(1);
  expect(replies.map((r) => r.question)).toEqual(['机器人你几岁了']);
});

test('what someone says within a minute of the bot answering them goes to the picker, not Jev', async () => {
  const picks: string[] = [];
  const replies: UnpromptedReply[] = [];
  let talker: Talker | undefined;
  const ran = setup(
    [
      () => talker!.answered('u-小红'),
      () => {
        ran.chat('小红', '印象深刻', 'u-小红');
        ran.chat('阿明', '一马当先', 'u-阿明');
      },
    ],
    {
      picker: ({ prompt }) => {
        picks.push(prompt);
        return Promise.resolve(JSON.stringify({ lines: [1] }));
      },
      pickTemplate: () => '{{lines}}',
      reply: (target) => void replies.push(target),
      streamer: () => null,
    },
  );
  talker = ran.talker;
  await talker.run();

  // Jev was asked only about 阿明's, which isn't about the bot.
  expect(ran.judged).toEqual(['(1) 00:00:40 [阿明] 一马当先']);
  expect(picks[0]).toContain('(1)★ 00:00:40 [小红] 印象深刻');
  expect(picks[0]).toContain('(2)  00:00:40 [阿明] 一马当先');
  expect(replies.map((r) => r.question)).toEqual(['印象深刻']);
});

test('after it talks to the room, what the streamer says, on the stream or in the chat, follows up', async () => {
  const picks: string[] = [];
  let talker: Talker | undefined;
  const ran = setup(
    [
      () => void talker!.talkNow('reply', WOKEN),
      () => {
        ran.say('那我接一个');
        ran.chat('虾虾', '印象深刻', 's-1');
      },
    ],
    {
      picker: ({ prompt }) => {
        picks.push(prompt);
        return Promise.resolve(JSON.stringify({ lines: [] }));
      },
      pickTemplate: () => '{{lines}}',
      reply: () => {},
      streamer: () => ({ uid: 's-1', nickname: '虾虾' }),
      quietMs: 0,
    },
  );
  talker = ran.talker;
  ran.answers.push(JSON.stringify({ reply: true, message: '我先出：心心相印' }));
  await talker.run();

  expect(ran.judged).toEqual([]);
  expect(picks[0]).toContain('★ 00:00:40 [主播] 那我接一个');
  expect(picks[0]).toContain('★ 00:00:40 [虾虾] 印象深刻');
});
