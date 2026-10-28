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

test('asks Jev nothing at a threshold of 1 or more, until it is lowered', async () => {
  const rounds = [
    () => chat('小红', '机器人在吗'),
    () => {
      autoReply.threshold = 0.6;
      chat('小红', '机器人在吗在吗');
    },
  ];
  const { autoReply, judged, chat } = setup(rounds, { threshold: 1 });
  await autoReply.run();

  // Only what was said after it was turned on.
  expect(judged).toEqual(['(1) 00:00:40 [小红] 机器人在吗在吗']);
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

test('with no quiet time it answers the next one without waiting', async () => {
  const replies: UnpromptedReply[] = [];
  const ran = setup(
    [
      () => {
        ran.autoReply.quietMs = 0;
        ran.chat('阿明', '机器人在吗', 'u-阿明');
      },
      () => ran.chat('小蓝', '机器人你几岁', 'u-小蓝'),
    ],
    {
      picker: () => Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] })),
      reply: (target) => void replies.push(target),
    },
  );
  await ran.autoReply.run();

  expect(replies.map((r) => r.nickname)).toEqual(['阿明', '小蓝']);
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

test("a line for a tool's listen topic goes to the picker, which is told the topics, and the pick carries the tool as a hint", async () => {
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
      // Jev finds the first is for the tool; the second only matches its trigger.
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
              { line: 1, confidence: 0.8 },
              { line: 2, confidence: 0.9 },
              { line: 3, confidence: 0.7 },
              { line: 4, confidence: 0.95 },
            ],
          }),
        );
      },
      pickTemplate: () => '{{lines}}\n{{topics}}',
      reply: (target) => void replies.push(target),
      streamer: () => null,
      topics: () => [
        { name: 'can_sing', when: '在问主播会不会唱某首歌', trigger: /会唱|虾虾会.+吗/ },
        { name: 'only_admin', when: '主播要叫它做事', adminOnly: true },
      ],
    },
  );
  await autoReply.run();

  expect(questions[0]!.q2t1).toBe('新内容第 (2) 条是不是在问主播会不会唱某首歌？');
  expect(picks[0]).toContain('(1)★ 00:00:20 [阿明] 虾虾唱一首晴天吧');
  expect(picks[0]).toContain('(2)★ 00:00:20 [小红] 会唱孤勇者吗');
  expect(picks[0]).toContain('(3)  00:00:20 [小蓝] 今晚吃火锅');
  expect(picks[0]).toContain('- can_sing：在问主播会不会唱某首歌');
  expect(picks[0]).toContain('- only_admin：主播要叫它做事（只有主播和管理员）');
  // Not 小蓝, whom neither Jev nor a trigger found anything in: the picker's pick of it is dropped.
  expect(replies.map((r) => r.nickname)).toEqual(['小绿', '小红', '阿明']);
  expect(replies[0]).toEqual({
    nickname: '小绿',
    userId: 'u-小绿',
    question: '虾虾会吃醋吗',
    heard: 'chat',
    topics: ['can_sing'],
  });
  // 小红 matched the trigger, 阿明 was found by Jev: both carry the tool.
  expect(replies.map((r) => r.topics)).toEqual([['can_sing'], ['can_sing'], ['can_sing']]);
});

test("a chat matching a tool's listen trigger is looked at at once, not at the next check", async () => {
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
            { line: 1, confidence: 0.1 },
            { line: 2, confidence: 0.9 },
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
    topics: () => [{ name: 'can_sing', when: '在问主播会不会唱某首歌', trigger: /会唱/ }],
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
  expect(replies.map((r) => r.question)).toEqual(['主播会唱晴天吗']);

  autoReply.stop();
  await running;
});

test("a chat mentioning one of a tool's phrases is looked at at once, and the picker is told which", async () => {
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
      return Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] }));
    },
    pickTemplate: () => '{{lines}}',
    reply: (target) => void replies.push(target),
    streamer: () => null,
    room: fakeRoom({ history, transcript, now: () => now }),
    log: silentLog,
    sleep: () => new Promise(() => {}),
    topics: () => [
      {
        name: 'can_sing',
        when: '在问主播会不会唱某首歌',
        mentioned: (t: string) => (t.includes('喂猪') ? '喂猪' : null),
      },
    ],
  });
  const running = autoReply.run();
  now = 2000;
  history.add({ ts: 2000, userId: 'u-雅', nickname: '雅', content: '虾虾会喂猪吗' });
  autoReply.hear({ ts: 2000, userId: 'u-雅', nickname: '雅', content: '虾虾会喂猪吗' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(prompts[0]).toContain('虾虾会喂猪吗  → can_sing（提到了它资料里的「喂猪」）');
  expect(replies.map((r) => r.nickname)).toEqual(['雅']);
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
      if (picked++ === 0) ran.later(5000, () => ran.chat('小红', '机器人再说一句', 'u-小红'));
      return Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] }));
    },
    reply: (target) => void replies.push(target),
  });
  await ran.autoReply.run();

  expect(replies.map((r) => r.question)).toEqual(['机器人在吗', '机器人再说一句']);
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

test("the streamer reading out the bot's chat isn't calling it: it goes to the picker, as a follow-up", async () => {
  const ran = aliasSetup(
    [
      () => {
        ran.chat('小助手', '转正要等主人批，考核也照常算数', 'bot-1');
        ran.speak('那是大部位啊转正要等主人批考核也照常算数');
      },
    ],
    { picks: [] },
  );
  await ran.autoReply.run();

  expect(ran.replies).toEqual([]);
  expect(ran.judged).toEqual([]);
  expect(ran.asked.map(({ why }) => why)).toEqual(['follow-up']);
  expect(ran.asked[0]!.prompt).toContain('那是大部位啊（念了小助手的弹幕）');
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
    { picks: [{ line: 1, confidence: 0.9 }] },
    { quietMs: 60_000, judge: judgeByWord([]) },
  );
  await ran.autoReply.run();

  expect(ran.replies.map((r) => r.question)).toEqual(['Fairy 你好', '机器人在吗']);
  // The picker sees the line answered already only as what was said, not one to answer.
  expect(ran.asked[0]!.prompt).toContain(
    '     00:00:20 [小红] Fairy 你好\n(1)★ 00:00:20 [阿明] 机器人在吗',
  );
});

/** Scores a line with 确定 in it 0.95, one with 机器人 0.8, anything else 0.1, or all `score` when given. */
const judgeSure =
  (score?: number): Judge =>
  (state, questions) => {
    const fresh = state.split('新内容：\n')[1]!.split('\n');
    const by = (text: string) =>
      score ?? (text.includes('确定') ? 0.95 : text.includes('机器人') ? 0.8 : 0.1);
    return Promise.resolve(
      Object.fromEntries(Object.keys(questions).map((key, i) => [key, by(fresh[i]!)])),
    );
  };

test('a line Jev is sure about (over 0.9) is answered at once, without the picker, which sees only the rest', async () => {
  const events: string[] = [];
  const prompts: string[] = [];
  const logged: [string, object | undefined][] = [];
  const { autoReply, chat } = setup(
    [
      () => {
        chat('甲', '机器人确定在吗', 'u-甲');
        chat('乙', '机器人你几岁', 'u-乙');
      },
    ],
    {
      judge: judgeSure(),
      picker: ({ prompt }) => {
        events.push('picker');
        prompts.push(prompt);
        return Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] }));
      },
      pickTemplate: () => '{{lines}}',
      reply: ({ nickname }) => void events.push(`reply ${nickname}`),
      log: { ...silentLog, info: (message, meta) => void logged.push([message, meta]) },
    },
  );
  await autoReply.run();

  expect(events).toEqual(['reply 甲', 'picker', 'reply 乙']);
  // 甲 is context to the picker, not a line it may pick.
  expect(prompts[0]).toContain('(1)★ 00:00:20 [乙] 机器人你几岁');
  expect(prompts[0]).toContain('     00:00:20 [甲] 机器人确定在吗');
  expect(logged.find(([message]) => message === 'sure about the bot')?.[1]).toEqual({
    who: '甲',
    text: '机器人确定在吗',
    score: 0.95,
  });
});

test('a sure line that also scored a topic carries the tool as a hint', async () => {
  const replies: UnpromptedReply[] = [];
  const { autoReply, chat } = setup([() => chat('甲', '机器人确定会唱歌吗', 'u-甲')], {
    judge: (_, asked) =>
      Promise.resolve(
        Object.fromEntries(Object.keys(asked).map((key) => [key, key === 'q1' ? 0.95 : 0.8])),
      ),
    topics: () => [{ name: 'can_sing', when: '在问主播会不会唱某首歌' }],
    reply: (target) => void replies.push(target),
  });
  await autoReply.run();

  expect(replies).toEqual([
    {
      nickname: '甲',
      userId: 'u-甲',
      question: '机器人确定会唱歌吗',
      heard: 'chat',
      topics: ['can_sing'],
    },
  ]);
});

test('exactly 0.9 is not sure: the picker is asked, and what it picks is answered', async () => {
  const events: string[] = [];
  const { autoReply, chat } = setup([() => chat('甲', '机器人在吗', 'u-甲')], {
    judge: judgeSure(0.9),
    picker: () => {
      events.push('picker');
      return Promise.resolve(JSON.stringify({ picks: [{ line: 1, confidence: 0.9 }] }));
    },
    reply: ({ nickname }) => void events.push(`reply ${nickname}`),
  });
  await autoReply.run();

  expect(events).toEqual(['picker', 'reply 甲']);
});

test('answering a sure line starts the quiet time, even when the picker has nothing to look at', async () => {
  const judged: string[] = [];
  const replies: UnpromptedReply[] = [];
  const ran = setup(
    [
      () => ran.chat('甲', '机器人确定在吗', 'u-甲'),
      () => ran.chat('乙', '机器人确定你几岁', 'u-乙'),
    ],
    {
      judge: (state, questions) => {
        judged.push(state.split('新内容：\n')[1]!);
        return judgeSure()(state, questions);
      },
      picker: () => Promise.reject(new Error('the picker should not be asked')),
      reply: (target) => void replies.push(target),
    },
  );
  await ran.autoReply.run();

  expect(replies.map((r) => r.nickname)).toEqual(['甲']);
  // 乙 was said within a minute of the answer, so it waits: the second check never asks Jev.
  expect(judged).toHaveLength(1);
});

test('a sure line from the streamer is answered as theirs, and waits while the streamer is unknown', async () => {
  const replies: UnpromptedReply[] = [];
  const ran = setup([() => ran.say('机器人确定你好')], {
    judge: judgeSure(),
    picker: () => Promise.reject(new Error('the picker should not be asked')),
    reply: (target) => void replies.push(target),
    streamer: () => ({ uid: 'host', nickname: '雅' }),
  });
  await ran.autoReply.run();
  expect(replies).toEqual([
    { nickname: '雅', userId: 'host', question: '机器人确定你好', heard: 'speech' },
  ]);

  const unknown: UnpromptedReply[] = [];
  const waiting = setup([() => waiting.say('机器人确定你好')], {
    judge: judgeSure(),
    picker: () => Promise.resolve(JSON.stringify({ picks: [] })),
    reply: (target) => void unknown.push(target),
  });
  await waiting.autoReply.run();
  expect(unknown).toEqual([]);
});

test("a tool listening to speech says its reply as it is when the streamer's words match, at most once a minute, and never for a chat", () => {
  const replies: UnpromptedReply[] = [];
  const ran = setup([], {
    reply: (target) => void replies.push(target),
    topics: () => [{ name: 'say_one', trigger: /打一/, speechReply: '1' }],
  });
  ran.autoReply.hearSpeech(ran.say('能理解的打一'));
  ran.later(30_000, () => ran.autoReply.hearSpeech(ran.say('能理解打一啊')));
  ran.later(31_000, () => ran.autoReply.hearSpeech(ran.say('没有问题的打一')));
  ran.later(1_000, () => ran.autoReply.hearSpeech(ran.say('我们讲下个题')));
  ran.autoReply.hear(ran.chat('小红', '打一', 'u-小红'));

  expect(ran.sent).toEqual([
    { kind: 'talk', text: '1' },
    { kind: 'talk', text: '1' },
  ]);
  expect(replies).toEqual([]);
});

test('a chat matching the trigger of a tool with no when is answered at once, with the tool as a hint; Jev and the picker never hear of the tool', async () => {
  const meme = { name: 'wuwa_meme', trigger: /[Bb]on voyage/ };
  const ran = aliasSetup(
    [
      () => {
        ran.call('苦***', 'Bon voyage～', '111111-苦***-31');
        expect(ran.replies).toEqual([
          {
            nickname: '苦***',
            userId: '111111-苦***-31',
            question: 'Bon voyage～',
            heard: 'chat',
            topics: ['wuwa_meme'],
          },
        ]);
        ran.call('阿明', '一路顺风', 'u-阿明');
      },
    ],
    { picks: [{ line: 1, confidence: 0.9 }] },
    {
      topics: () => [meme, { name: 'can_sing', when: '在问主播会不会唱某首歌', trigger: /会唱/ }],
      pickTemplate: () => '{{lines}}|{{topics}}',
    },
  );
  await ran.autoReply.run();

  // The check leaves the answered line out; what else was said is judged without the tool's topic.
  expect(ran.judged).toEqual(['(1) 00:00:20 [阿明] 一路顺风']);
  expect(ran.asked.map((q) => q.prompt).join()).not.toContain('wuwa_meme');
  expect(ran.names('trigger matched')).toEqual([
    { tools: ['wuwa_meme'], who: '苦***', text: 'Bon voyage～' },
  ]);
});
