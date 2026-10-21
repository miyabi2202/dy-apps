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
function setup(
  rounds: (() => void)[],
  options: Partial<AutoReplyOptions> = {},
  aliases: string[] = [],
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
  const chat = (nickname: string, content: string, userId?: string) =>
    history.add({ ts: now, nickname, content, ...(userId && { userId }) });
  const say = (text: string) => transcript.add({ start: now - 2000, end: now, text, speech: 0.8 });
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
  autoReply.hear({ userId: 'u-阿明', content: '今晚吃火锅' });
  await settle();
  expect(replies).toEqual([]);

  now = 3000;
  history.add({ ts: 3000, userId: 'u-小红', nickname: '小红', content: '主播会唱晴天吗' });
  autoReply.hear({ userId: 'u-小红', content: '主播会唱晴天吗' });
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
  autoReply.hear({ userId: 'u-雅', content: '虾虾会喂猪吗' });
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

/** An auto-reply in a room where the bot is also called `Fairy` and `菲瑞`, whose picker says `picks`. */
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
    ['Fairy', '菲瑞'],
  );
  const names = (message: string) =>
    logged.filter(([, m]) => m === message).map(([, , meta]) => meta);
  return { ...ran, asked, replies, judged, names };
}

test('a chat with an alias in it, in any case, goes to the picker without asking Jev, which still decides', async () => {
  const ran = aliasSetup(
    [
      () => {
        ran.chat('小红', 'FAIRY 你好呀', 'u-小红');
        ran.chat('阿明', '今晚吃火锅', 'u-阿明');
      },
    ],
    { picks: [{ line: 1, confidence: 0.9, command: '' }] },
  );
  await ran.autoReply.run();

  // Only what isn't about the bot by name is Jev's to score.
  expect(ran.judged).toEqual(['(1) 00:00:20 [阿明] 今晚吃火锅']);
  expect(ran.asked).toHaveLength(1);
  expect(ran.asked[0]!.why).toBe('alias');
  expect(ran.asked[0]!.prompt).toContain('(1)★ 00:00:20 [小红] FAIRY 你好呀');
  expect(ran.asked[0]!.prompt).toContain('Fairy、菲瑞');
  expect(ran.replies.map((r) => [r.nickname, r.question])).toEqual([['小红', 'FAIRY 你好呀']]);
  expect(ran.names('alias matched')).toEqual([
    { alias: 'Fairy', who: '小红', text: 'FAIRY 你好呀' },
  ]);
  expect(ran.names('alias pick')).toEqual([
    { alias: 'Fairy', text: 'FAIRY 你好呀', answered: true, confidence: 0.9 },
  ]);
});

test('an alias the picker finds not to be for the bot is a false positive, logged with its confidence', async () => {
  const ran = aliasSetup([() => ran.chat('小红', '我喜欢菲瑞这个名字', 'u-小红')], {
    picks: [{ line: 1, confidence: 0.2, command: '' }],
  });
  await ran.autoReply.run();

  expect(ran.replies).toEqual([]);
  expect(ran.names('alias pick')).toEqual([
    { alias: '菲瑞', text: '我喜欢菲瑞这个名字', answered: false, confidence: 0.2 },
  ]);
});

test('a failing picker is logged for the aliases too, with the error', async () => {
  const ran = aliasSetup(
    [() => ran.chat('小红', 'Fairy 在吗', 'u-小红')],
    new Error('codex failed'),
  );
  await ran.autoReply.run();

  expect(ran.names('alias pick')).toEqual([
    { alias: 'Fairy', text: 'Fairy 在吗', answered: false, error: 'codex failed' },
  ]);
});

test('what the streamer says with an alias in it, as speech recognition wrote it, is answered as theirs', async () => {
  const ran = aliasSetup([() => ran.say('FAIRY 你来唱一首')], {
    picks: [{ line: 1, confidence: 0.8, command: '' }],
  });
  await ran.autoReply.run();

  expect(ran.replies).toEqual([
    { nickname: '雅', userId: 'host', question: 'FAIRY 你来唱一首', heard: 'speech' },
  ]);
  expect(ran.names('alias pick')).toEqual([
    { alias: 'Fairy', text: 'FAIRY 你来唱一首', answered: true, confidence: 0.8 },
  ]);
});

test('works in a 私密 room, where every viewer is a made-up id', async () => {
  const ran = aliasSetup([() => ran.chat('苦***', 'Fairy 你好', '111111-苦***-31')], {
    picks: [{ line: 1, confidence: 0.9, command: '' }],
  });
  await ran.autoReply.run();

  expect(ran.replies.map((r) => r.userId)).toEqual(['111111-苦***-31']);
});

test('does not turn auto-reply on: at a threshold of 1 an alias is not looked at', async () => {
  const ran = aliasSetup(
    [() => ran.chat('小红', 'Fairy 你好', 'u-小红')],
    { picks: [] },
    { threshold: 1 },
  );
  ran.autoReply.hear({ userId: 'u-小红', content: 'Fairy 你好' });
  await ran.autoReply.run();

  expect(ran.asked).toEqual([]);
  expect(ran.names('alias matched')).toEqual([]);
});

test('keeps quiet after talking like for anything else, and looks at the alias after', async () => {
  const ran = aliasSetup(
    [
      () => ran.chat('小红', 'Fairy 你好', 'u-小红'),
      () => ran.chat('阿明', 'fairy 在吗', 'u-阿明'),
      () => {},
    ],
    { picks: [{ line: 1, confidence: 0.9, command: '' }] },
    { quietMs: 25_000 },
  );
  await ran.autoReply.run();

  // The second came 20 s after the first answer, inside the quiet time; the next check (40 s on) took it.
  expect(ran.replies.map((r) => r.nickname)).toEqual(['小红', '阿明']);
  expect(ran.asked).toHaveLength(2);
});

test("the bot's account nickname is not an alias: a line with it is still Jev's to score", async () => {
  // The fake room's bot is 小助手; a nickname like 默认关闭 is also an everyday phrase.
  const ran = aliasSetup([() => ran.chat('小红', '小助手这个功能默认关闭了吗', 'u-小红')], {
    picks: [],
  });
  await ran.autoReply.run();

  expect(ran.judged).toEqual(['(1) 00:00:20 [小红] 小助手这个功能默认关闭了吗']);
  expect(ran.asked).toEqual([]);
  expect(ran.names('alias matched')).toEqual([]);
});
