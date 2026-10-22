import type { Judge, Log } from '../../../src/app/ports';
import { fakeRoom } from '../../support/fake-room';
import { AutoReply, type AutoReplyOptions } from '../../../src/app/replies/auto-reply';
import type { UnpromptedReply } from '../../../src/app/replies/mention-answerer';
import type { Alias } from '../../../src/core/viewers/alias';
import { OutOfCreditError } from '../../../src/core/errors';
import { ChatHistory } from '../../../src/core/chat/chat-history';
import { Transcript } from '../../../src/core/songs/transcript';

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
function setup(
  rounds: (() => void)[],
  options: Partial<AutoReplyOptions> = {},
  aliases: Alias[] = [],
) {
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
    room: fakeRoom({ history, transcript, now: () => now, aliases: () => aliases }),
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
  const chat = (nickname: string, content: string, userId?: string) => {
    const line = { ts: now, nickname, content, ...(userId && { userId }) };
    history.add(line);
    return line;
  };
  const say = (text: string) => {
    const line = { start: now - 2000, end: now, text, speech: 0.8 };
    transcript.add(line);
    return line;
  };
  /** Moves the clock on by `ms` and runs `then`, as if it happened while something was awaited. */
  const later = (ms: number, then: () => void) => {
    now += ms;
    then();
  };
  return { autoReply, sent, judged, chat, say, later };
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

test('keeps quiet for a minute only after it answered someone, not when the picker picked nobody', async () => {
  const picks = [{ line: 1, confidence: 0.1 }];
  const replies: UnpromptedReply[] = [];
  const ran = setup(
    [
      () => ran.chat('小红', '机器人你好', 'u-小红'),
      () => ran.chat('阿明', '机器人在吗', 'u-阿明'),
      // It answered 阿明, so what comes next waits out the minute.
      () => ran.chat('小蓝', '机器人你几岁', 'u-小蓝'),
      () => {},
    ],
    {
      picker: () => {
        const answer = JSON.stringify({ picks });
        picks[0] = { line: 1, confidence: 0.9 };
        return Promise.resolve(answer);
      },
      reply: (target) => void replies.push(target),
    },
  );
  await ran.autoReply.run();

  expect(replies.map((r) => r.nickname)).toEqual(['阿明']);
  expect(ran.judged).toEqual(['(1) 00:00:20 [小红] 机器人你好', '(1) 00:00:40 [阿明] 机器人在吗']);
});

test('/自动回复间隔 0 answers the next one without waiting', async () => {
  const replies: UnpromptedReply[] = [];
  const ran = setup(
    [
      () => {
        expect(run('自动回复间隔', '0')).toEqual({ ok: true, reply: '已处理自动回复间隔请求' });
        ran.chat('阿明', '机器人在吗', 'u-阿明');
      },
      () => ran.chat('小蓝', '机器人你几岁', 'u-小蓝'),
    ],
    {
      picker: () => Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] })),
      reply: (target) => void replies.push(target),
    },
  );
  const run = (name: string, args: string) =>
    ran.autoReply
      .commands()
      .find((command) => command.name === name)
      ?.run?.(args);
  await ran.autoReply.run();

  expect(replies.map((r) => r.nickname)).toEqual(['阿明', '小蓝']);
  expect(run('自动回复间隔', '半分钟')).toEqual({
    ok: false,
    reply: '间隔要写成秒数，0 表示不等，用法：/自动回复间隔 20',
  });
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

test('after it answered the streamer, what the streamer says, on the stream or in the chat, follows up', async () => {
  const picks: string[] = [];
  const ran = setup(
    [
      () => ran.autoReply.answered('s-1'),
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

test("what one of the room's own commands is for goes to the picker, which may answer it with that command, and only with one", async () => {
  const questions: Record<string, string>[] = [];
  const picks: string[] = [];
  const replies: UnpromptedReply[] = [];
  const { autoReply, chat } = setup(
    [
      () => {
        chat('阿明', '虾虾唱一首晴天吧', 'u-阿明');
        chat('小红', '会唱孤勇者吗', 'u-小红');
        chat('小蓝', '今晚吃火锅', 'u-小蓝');
        chat('小绿', '虾虾会吃醋吗', 'u-小绿');
      },
    ],
    {
      // Jev finds the first is for the command; the second only matches its trigger.
      judge: (_, asked) => {
        questions.push(asked);
        return Promise.resolve({
          ...Object.fromEntries(Object.keys(asked).map((k) => [k, 0.1])),
          q1t1: 0.8,
        });
      },
      picker: ({ prompt }) => {
        picks.push(prompt);
        return Promise.resolve(
          JSON.stringify({
            picks: [
              { line: 1, confidence: 0.8, command: 'can-sing' },
              { line: 2, confidence: 0.9, command: 'can-sing' },
              { line: 3, confidence: 0.7, command: 'no-such' },
              { line: 4, confidence: 0.95, command: '' },
            ],
          }),
        );
      },
      pickTemplate: () => '{{lines}}\n{{commands}}',
      reply: (target) => void replies.push(target),
      streamer: () => null,
      additionalCommands: () => [
        { id: 'can-sing', when: '在问主播会不会唱某首歌', trigger: /会唱|虾虾会.+吗/ },
      ],
    },
  );
  await autoReply.run();

  expect(questions[0]!.q2t1).toBe('新内容第 (2) 条是不是在问主播会不会唱某首歌？');
  expect(picks[0]).toContain('(1)★ 00:00:20 [阿明] 虾虾唱一首晴天吧');
  expect(picks[0]).toContain('(2)★ 00:00:20 [小红] 会唱孤勇者吗');
  expect(picks[0]).toContain('(3)  00:00:20 [小蓝] 今晚吃火锅');
  expect(picks[0]).toContain('- can-sing：在问主播会不会唱某首歌');
  expect(replies).toEqual([
    // 小绿 only matched the trigger and was picked to be answered as usual: it goes to the command
    // it came for. Not 小蓝 (picked with a command the room doesn't have): not about the bot.
    {
      nickname: '小绿',
      userId: 'u-小绿',
      question: '虾虾会吃醋吗',
      heard: 'chat',
      command: 'can-sing',
    },
    {
      nickname: '小红',
      userId: 'u-小红',
      question: '会唱孤勇者吗',
      heard: 'chat',
      command: 'can-sing',
    },
    {
      nickname: '阿明',
      userId: 'u-阿明',
      question: '虾虾唱一首晴天吧',
      heard: 'chat',
      command: 'can-sing',
    },
  ]);
});

test("a chat matching a room command's trigger is looked at at once, not at the next check", async () => {
  let now = 1000;
  const history = new ChatHistory(100);
  const transcript = new Transcript(Infinity, () => now);
  const replies: UnpromptedReply[] = [];
  const autoReply: AutoReply = new AutoReply({
    outbox: { push: () => {} },
    judge: (_, questions) =>
      Promise.resolve(Object.fromEntries(Object.keys(questions).map((k) => [k, 0.1]))),
    threshold: 0.6,
    picker: () =>
      Promise.resolve(
        JSON.stringify({
          picks: [
            { line: 1, confidence: 0.1, command: '' },
            { line: 2, confidence: 0.9, command: 'can-sing' },
          ],
        }),
      ),
    pickTemplate: () => '{{lines}}',
    reply: (target) => void replies.push(target),
    streamer: () => null,
    room: fakeRoom({ history, transcript, now: () => now }),
    log: silentLog,
    // The next check never comes by itself.
    sleep: () => new Promise(() => {}),
    additionalCommands: () => [{ id: 'can-sing', when: '在问主播会不会唱某首歌', trigger: /会唱/ }],
  });
  const running = autoReply.run();
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  now = 2000;
  history.add({ ts: 2000, userId: 'u-阿明', nickname: '阿明', content: '今晚吃火锅' });
  autoReply.hear({ ts: 2000, userId: 'u-阿明', nickname: '阿明', content: '今晚吃火锅' });
  await settle();
  expect(replies).toEqual([]);

  now = 3000;
  history.add({ ts: 3000, userId: 'u-小红', nickname: '小红', content: '主播会唱晴天吗' });
  autoReply.hear({ ts: 3000, userId: 'u-小红', nickname: '小红', content: '主播会唱晴天吗' });
  await settle();
  expect(replies.map((r) => [r.question, r.command])).toEqual([['主播会唱晴天吗', 'can-sing']]);

  autoReply.stop();
  await running;
});

test("a chat mentioning one of a room command's phrases is looked at at once, and the picker is told which", async () => {
  let now = 1000;
  const history = new ChatHistory(100);
  const transcript = new Transcript(Infinity, () => now);
  const prompts: string[] = [];
  const replies: UnpromptedReply[] = [];
  const autoReply: AutoReply = new AutoReply({
    outbox: { push: () => {} },
    judge: (_, questions) =>
      Promise.resolve(Object.fromEntries(Object.keys(questions).map((k) => [k, 0.1]))),
    threshold: 0.6,
    picker: ({ prompt }) => {
      prompts.push(prompt);
      return Promise.resolve(
        JSON.stringify({ picks: [{ line: 1, confidence: 0.9, command: 'can-sing' }] }),
      );
    },
    pickTemplate: () => '{{lines}}',
    reply: (target) => void replies.push(target),
    streamer: () => null,
    room: fakeRoom({ history, transcript, now: () => now }),
    log: silentLog,
    sleep: () => new Promise(() => {}),
    additionalCommands: () => [
      {
        id: 'can-sing',
        when: '在问主播会不会唱某首歌',
        trigger: null,
        mentioned: (t: string) => (t.includes('喂猪') ? '喂猪' : null),
      },
    ],
  });
  const running = autoReply.run();
  now = 2000;
  history.add({ ts: 2000, userId: 'u-雅', nickname: '雅', content: '虾虾会喂猪吗' });
  autoReply.hear({ ts: 2000, userId: 'u-雅', nickname: '雅', content: '虾虾会喂猪吗' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(prompts[0]).toContain('虾虾会喂猪吗  → can-sing（提到了它资料里的「喂猪」）');
  expect(replies.map((r) => r.command)).toEqual(['can-sing']);
  autoReply.stop();
  await running;
});

test('what is said while it picks whom to answer is looked at in the next check', async () => {
  let picked = 0;
  const replies: UnpromptedReply[] = [];
  const ran = setup([() => ran.chat('阿明', '机器人在吗', 'u-阿明'), () => {}, () => {}], {
    quietMs: 0,
    picker: () => {
      // 小红 says something while the picker thinks about 阿明.
      if (picked++ === 0) ran.later(5000, () => ran.chat('小红', '机器人翻旧账', 'u-小红'));
      return Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] }));
    },
    reply: (target) => void replies.push(target),
  });
  await ran.autoReply.run();

  expect(replies.map((r) => r.question)).toEqual(['机器人在吗', '机器人翻旧账']);
});

/**
 * An auto-reply in a room where the bot (小助手) is also called `Fairy` (heard as `ferry`) and `菲瑞`,
 * whose picker says `picks`. `call` and `speak` say something as the room does: into the history,
 * and heard by the auto-reply.
 */
function aliasSetup(
  rounds: (() => void)[],
  picks: unknown,
  options: Partial<AutoReplyOptions> = {},
) {
  const logged: [string, string, unknown][] = [];
  const log: Log = {
    debug() {},
    info: (message, meta) => void logged.push(['info', message, meta]),
    warn: (message, meta) => void logged.push(['warn', message, meta]),
    error() {},
  };
  const asked: { prompt: string; why?: string }[] = [];
  const replies: UnpromptedReply[] = [];
  const judged: string[] = [];
  const ran = setup(
    rounds,
    {
      quietMs: 0,
      log,
      judge: (state, questions) => {
        judged.push(state.split('新内容：\n')[1] ?? '');
        return Promise.resolve(Object.fromEntries(Object.keys(questions).map((k) => [k, 0.1])));
      },
      reply: (target) => void replies.push(target),
      streamer: () => ({ uid: 'host', nickname: '雅' }),
      picker: (question) => {
        asked.push(question);
        return picks instanceof Error
          ? Promise.reject(picks)
          : Promise.resolve(JSON.stringify(picks));
      },
      pickTemplate: () => '{{lines}}|{{aliases}}',
      ...options,
    },
    [
      { name: 'Fairy', heardAs: ['ferry'] },
      { name: '菲瑞', heardAs: [] },
    ],
  );
  const call = (nickname: string, content: string, userId: string) => {
    ran.autoReply.hear(ran.chat(nickname, content, userId));
  };
  const speak = (text: string) => ran.autoReply.hearSpeech(ran.say(text));
  const names = (message: string) =>
    logged.filter(([, m]) => m === message).map(([, , meta]) => meta);
  return { ...ran, call, speak, asked, replies, judged, names };
}

test('a chat calling the bot by an alias, in any case, is answered at once, without Jev or the picker', async () => {
  const ran = aliasSetup(
    [
      () => {
        ran.call('小红', 'FAIRY 你好呀', 'u-小红');
        // Answered before the check comes.
        expect(ran.replies.map((r) => [r.nickname, r.question, r.heard])).toEqual([
          ['小红', 'FAIRY 你好呀', 'chat'],
        ]);
        ran.call('阿明', '今晚吃火锅', 'u-阿明');
      },
      () => {},
    ],
    { picks: [] },
  );
  await ran.autoReply.run();

  // The check leaves the answered line out, then and after, and judges the rest.
  expect(ran.judged).toEqual(['(1) 00:00:20 [阿明] 今晚吃火锅']);
  expect(ran.asked).toEqual([]);
  expect(ran.replies).toHaveLength(1);
  expect(ran.names('name called')).toEqual([
    { name: 'Fairy', who: '小红', text: 'FAIRY 你好呀', heard: 'chat' },
  ]);
});

test("the bot's own nickname calls it too", async () => {
  const ran = aliasSetup([() => ran.call('小红', '小助手在吗', 'u-小红')], { picks: [] });
  await ran.autoReply.run();

  expect(ran.replies.map((r) => r.question)).toEqual(['小助手在吗']);
  expect(ran.judged).toEqual([]);
});

test('in chat only the name as written counts: not how speech recognition hears it, nor what sounds like it', async () => {
  const ran = aliasSetup(
    [
      () => {
        ran.call('小红', 'ferry 你好', 'u-小红');
        ran.call('阿明', '小主手在吗', 'u-阿明');
      },
    ],
    { picks: [] },
  );
  await ran.autoReply.run();

  expect(ran.replies).toEqual([]);
  expect(ran.judged).toEqual(['(1) 00:00:20 [小红] ferry 你好\n(2) 00:00:20 [阿明] 小主手在吗']);
});

test("the streamer is answered as theirs for a name as speech recognition wrote it: a heardAs, or the name's pinyin", async () => {
  const ran = aliasSetup([() => ran.speak('FERRY 你来唱一首'), () => ran.speak('小主手你说呢')], {
    picks: [],
  });
  await ran.autoReply.run();

  expect(ran.replies).toEqual([
    { nickname: '雅', userId: 'host', question: 'FERRY 你来唱一首', heard: 'speech' },
    { nickname: '雅', userId: 'host', question: '小主手你说呢', heard: 'speech' },
  ]);
  expect(ran.names('name called').map((m) => (m as { name: string }).name)).toEqual([
    'Fairy',
    '小助手',
  ]);
});

test('the streamer calling the bot while who they are is not known yet is only logged', async () => {
  const ran = aliasSetup([() => ran.speak('Fairy 你好')], { picks: [] }, { streamer: () => null });
  await ran.autoReply.run();

  expect(ran.replies).toEqual([]);
  expect(ran.names('name called, streamer unknown')).toEqual([
    { name: 'Fairy', text: 'Fairy 你好' },
  ]);
});

test('works in a 私密 room, where every viewer is a made-up id', async () => {
  const ran = aliasSetup([() => ran.call('苦***', 'Fairy 你好', '111111-苦***-31')], {
    picks: [],
  });
  await ran.autoReply.run();

  expect(ran.replies.map((r) => r.userId)).toEqual(['111111-苦***-31']);
});

test('does not turn auto-reply on: at a threshold of 1 a name is not answered', async () => {
  const ran = aliasSetup(
    [() => ran.call('小红', 'Fairy 你好', 'u-小红'), () => ran.speak('Fairy 你好')],
    { picks: [] },
    { threshold: 1 },
  );
  await ran.autoReply.run();

  expect(ran.replies).toEqual([]);
  expect(ran.names('name called')).toEqual([]);
});

test('a name call does not start the quiet time: what else was said is picked from at the next check', async () => {
  const ran = aliasSetup(
    [
      () => {
        ran.call('小红', 'Fairy 你好', 'u-小红');
        ran.call('阿明', '机器人在吗', 'u-阿明');
      },
    ],
    { picks: [{ line: 1, confidence: 0.9, command: '' }] },
    { quietMs: 60_000, judge: judgeByWord([]) },
  );
  await ran.autoReply.run();

  expect(ran.replies.map((r) => r.question)).toEqual(['Fairy 你好', '机器人在吗']);
  // The picker sees the line answered already only as what was said, not one to answer.
  expect(ran.asked[0]!.prompt).toContain(
    '     00:00:20 [小红] Fairy 你好\n(1)★ 00:00:20 [阿明] 机器人在吗',
  );
});
