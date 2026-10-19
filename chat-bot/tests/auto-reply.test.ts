import type { Judge, Log } from '../src/app/ports';
import { fakeRoom } from './fake-room';
import { AutoReply, type AutoReplyOptions } from '../src/app/auto-reply';
import type { UnpromptedReply } from '../src/app/mention-answerer';
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
 * An auto-reply whose every wait moves the clock on and then runs the next of `rounds` (what happens in
 * the room meanwhile), stopping once they run out.
 */
function setup(rounds: (() => void)[], options: Partial<AutoReplyOptions> = {}) {
  let now = 0;
  const transcript = new Transcript(Infinity, () => now);
  const history = new ChatHistory(100);
  const sent: { kind: string; text: string }[] = [];
  const judged: string[] = [];
  const autoReply: AutoReply = new AutoReply({
    outbox: { push: (message) => sent.push(message) },
    judge: judgeByWord(judged),
    threshold: 0.6,
    picker: () => Promise.resolve(JSON.stringify({ picks: [] })),
    pickTemplate: () => '{{lines}}',
    reply: () => {},
    streamer: () => null,
    room: fakeRoom({ history, transcript, now: () => now }),
    log: silentLog,
    sleep: (ms) => {
      now += ms;
      const round = rounds.shift();
      if (round) round();
      else autoReply.stop();
      return Promise.resolve();
    },
    ...options,
  });
  const chat = (nickname: string, content: string, userId?: string) =>
    history.add({ ts: now, nickname, content, ...(userId && { userId }) });
  const say = (text: string) => transcript.add({ start: now - 2000, end: now, text, speech: 0.8 });
  return { autoReply, sent, judged, chat, say };
}

test('asks Jev nothing at a threshold of 1 or more, until /自动回复阈值 lowers it', async () => {
  const rounds = [
    () => chat('小红', '机器人在吗'),
    () => {
      expect(run('自动回复阈值', '0.6')).toEqual({ ok: true, reply: '已处理自动回复阈值请求' });
      chat('小红', '机器人在吗在吗');
    },
  ];
  const { autoReply, judged, chat } = setup(rounds, { threshold: 1 });
  const run = (name: string, args: string) =>
    autoReply
      .commands()
      .find((command) => command.name === name)
      ?.run?.(args);
  await autoReply.run();

  // Only what was said after it was turned on.
  expect(judged).toEqual(['(1) 00:00:40 [小红] 机器人在吗在吗']);
  expect(run('自动回复阈值', '一半')).toEqual({
    ok: false,
    reply: '阈值要写成 0 到 1 之间的小数，1 表示关闭，用法：/自动回复阈值 0.6',
  });
  expect(autoReply.threshold).toBe(0.6);
});

test('when Jev runs out of money, says so in the room and turns itself off', async () => {
  let asked = 0;
  const { autoReply, sent, chat } = setup(
    [() => chat('小红', '机器人在吗'), () => chat('小红', '机器人还在吗'), () => {}],
    {
      judge: () => {
        asked++;
        return Promise.reject(new OutOfCreditError('jev answered 402: insufficient credits'));
      },
    },
  );
  await autoReply.run();

  expect(sent).toEqual([{ kind: 'system', text: '钱包烧干了，自动回复已关闭' }]);
  expect(autoReply.threshold).toBe(10);
  expect(asked).toBe(1);
});

test('with a picker, answers what it is sure enough of like a mention, surest first, the streamer by their uid', async () => {
  const picks: string[] = [];
  const replies: UnpromptedReply[] = [];
  const { autoReply, sent, chat, say } = setup(
    [
      () => {
        chat('阿明', '今晚吃火锅', 'u-阿明');
        chat('小红', '机器人你几岁了', 'u-小红');
        say('机器人你也说两句');
      },
    ],
    {
      picker: ({ prompt }) => {
        picks.push(prompt);
        return Promise.resolve(
          JSON.stringify({
            picks: [
              { line: 1, confidence: 0.4 },
              { line: 2, confidence: 0.7 },
              { line: 3, confidence: 0.8 },
              { line: 2, confidence: 0.9 },
              { line: 9, confidence: 0.9 },
            ],
          }),
        );
      },
      pickTemplate: () => '{{botName}}\n{{lines}}',
      reply: (target) => void replies.push(target),
      streamer: () => ({ uid: 's-1', nickname: '虾虾' }),
    },
  );
  await autoReply.run();

  expect(picks[0]).toContain('(1)  00:00:20 [阿明] 今晚吃火锅');
  expect(picks[0]).toContain('(2)★ 00:00:20 [小红] 机器人你几岁了');
  expect(picks[0]).toContain('(3)★ 00:00:20 [主播] 机器人你也说两句');
  expect(replies).toEqual([
    { nickname: '小红', userId: 'u-小红', question: '机器人你几岁了', heard: 'chat' },
    { nickname: '虾虾', userId: 's-1', question: '机器人你也说两句', heard: 'speech' },
  ]);
  expect(sent).toEqual([]);
});

test('the picker may answer nobody, and gets no streamer line while the streamer is unknown', async () => {
  const picks: string[] = [];
  const replies: UnpromptedReply[] = [];
  const { autoReply, chat, say } = setup(
    [
      () => {
        chat('小红', '机器人你几岁了', 'u-小红');
        say('机器人你也说两句');
      },
    ],
    {
      picker: ({ prompt }) => {
        picks.push(prompt);
        return Promise.resolve(JSON.stringify({ picks: [] }));
      },
      pickTemplate: () => '{{lines}}',
      reply: (target) => void replies.push(target),
      streamer: () => null,
    },
  );
  await autoReply.run();

  expect(picks[0]).toContain('     00:00:20 [主播] 机器人你也说两句');
  expect(picks[0]).not.toContain('(2)');
  expect(replies).toEqual([]);
});

test('picks whom to answer as soon as something is about the bot', async () => {
  const replies: UnpromptedReply[] = [];
  let picked = 0;
  const { autoReply, chat } = setup([() => chat('小红', '机器人你几岁了', 'u-小红')], {
    picker: () => {
      picked = 1;
      return Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] }));
    },
    pickTemplate: () => '{{lines}}',
    reply: (target) => void replies.push(target),
    streamer: () => null,
  });
  await autoReply.run();

  expect(picked).toBe(1);
  expect(replies.map((r) => r.question)).toEqual(['机器人你几岁了']);
});

test('a follow-up still goes to the picker when Jev fails on the rest', async () => {
  const replies: UnpromptedReply[] = [];
  const ran = setup(
    [
      () => ran.autoReply.answered('u-小红'),
      () => {
        ran.chat('小红', '印象深刻', 'u-小红');
        ran.chat('阿明', '一马当先', 'u-阿明');
      },
    ],
    {
      judge: () => Promise.reject(new Error('jev answered 500')),
      picker: () => Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] })),
      reply: (target) => void replies.push(target),
    },
  );
  await ran.autoReply.run();

  expect(replies.map((r) => r.question)).toEqual(['印象深刻']);
});

test('what someone says within a minute of the bot answering them goes to the picker, not Jev', async () => {
  const picks: string[] = [];
  const replies: UnpromptedReply[] = [];
  const ran = setup(
    [
      () => ran.autoReply.answered('u-小红'),
      () => {
        ran.chat('小红', '印象深刻', 'u-小红');
        ran.chat('阿明', '一马当先', 'u-阿明');
      },
    ],
    {
      picker: ({ prompt }) => {
        picks.push(prompt);
        return Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] }));
      },
      pickTemplate: () => '{{lines}}',
      reply: (target) => void replies.push(target),
      streamer: () => null,
    },
  );
  await ran.autoReply.run();

  // Jev was asked only about 阿明's, which isn't about the bot.
  expect(ran.judged).toEqual(['(1) 00:00:40 [阿明] 一马当先']);
  expect(picks[0]).toContain('(1)★ 00:00:40 [小红] 印象深刻');
  expect(picks[0]).toContain('(2)  00:00:40 [阿明] 一马当先');
  expect(replies.map((r) => r.question)).toEqual(['印象深刻']);
});

test('after it spoke to the room, what the streamer says, on the stream or in the chat, follows up', async () => {
  const picks: string[] = [];
  const ran = setup(
    [
      () => ran.autoReply.spokeToRoom(),
      () => {
        ran.say('那我接一个');
        ran.chat('虾虾', '印象深刻', 's-1');
      },
    ],
    {
      picker: ({ prompt }) => {
        picks.push(prompt);
        return Promise.resolve(JSON.stringify({ picks: [] }));
      },
      pickTemplate: () => '{{lines}}',
      reply: () => {},
      streamer: () => ({ uid: 's-1', nickname: '虾虾' }),
      quietMs: 0,
    },
  );
  await ran.autoReply.run();

  expect(ran.judged).toEqual([]);
  expect(picks[0]).toContain('★ 00:00:40 [主播] 那我接一个');
  expect(picks[0]).toContain('★ 00:00:40 [虾虾] 印象深刻');
});

test('answers at most 3 at once, the surest first', async () => {
  const replies: UnpromptedReply[] = [];
  const { autoReply, chat } = setup(
    [
      () => {
        for (const name of ['甲', '乙', '丙', '丁', '戊']) chat(name, `机器人${name}`, `u-${name}`);
      },
    ],
    {
      picker: () =>
        Promise.resolve(
          JSON.stringify({
            picks: [1, 2, 3, 4, 5].map((line) => ({ line, confidence: 0.7 + line / 100 })),
          }),
        ),
      reply: (target) => void replies.push(target),
    },
  );
  await autoReply.run();

  expect(replies.map((r) => r.nickname)).toEqual(['戊', '丁', '丙']);
});
