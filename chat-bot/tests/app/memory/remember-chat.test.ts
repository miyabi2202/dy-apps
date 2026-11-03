import { addItems, openItems } from '@dy-apps/to-learn';
import type { BotFeedback, Question, Thoughts, ToLearnList } from '../../../src/app/ports';
import { RememberChat } from '../../../src/app/memory/remember-chat';
import { fakeMemory, noteFile, ROOM_FILE, STREAMS_FILE } from '../../support/fake-memory';

const silentLog = { debug() {}, info() {}, warn() {}, error() {} };
const T0 = Date.parse('2026-10-24T20:00:00+08:00');

/** A record line at `T0 + s` seconds. */
function at(s: number, who: string, type: string, text: string): string {
  const stamp = new Date(T0 + s * 1000 + 8 * 3_600_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  return `${stamp}+08:00 [${who}](${type}) ${text}`;
}

/** RememberChat over `record`, with Claude answering `answers` by which prompt it got. */
function setup({
  record,
  answers,
  mark,
  isPrivate = false,
  dayOf,
  thoughts,
  toLearn,
  feedback,
}: {
  record: string[];
  answers: {
    notes?: unknown;
    room?: unknown;
    thoughts?: unknown;
    toLearn?: unknown;
    feedback?: unknown;
  };
  mark?: number;
  isPrivate?: boolean;
  dayOf?: (ms: number) => string;
  /** The bot's thoughts after earlier streams; none asks for no thoughts. */
  thoughts?: string[];
  /** The to-learn list's text and the knowledge base's terms; none asks for nothing to learn. */
  toLearn?: { text: string; known: string[] };
  /** What the feedback list was given; none asks for no feedback. */
  feedback?: { roomId: string; date: string; items: readonly BotFeedback[] }[];
}) {
  const { memory, store } = fakeMemory({ [ROOM_FILE]: '主播叫咿咿\n' });
  const asked: Question[] = [];
  const marks = { value: mark };
  /** The thoughts store in memory: `date：text` a line. */
  const thoughtsStore: Pick<Thoughts, 'recent' | 'add'> = {
    recent: (count) => (thoughts ?? []).slice(-count).join('\n'),
    add: (date, entries) => thoughts?.push(...entries.map((entry) => `${date}：${entry}`)),
  };
  /** The to-learn list in memory, with the real line format. */
  const list: ToLearnList = {
    open: () => openItems(toLearn!.text).map((item) => item.term),
    add(items, options) {
      const before = openItems(toLearn!.text).length;
      toLearn!.text = addItems(toLearn!.text, items, options);
      return openItems(toLearn!.text).slice(before);
    },
  };
  const remember = new RememberChat({
    ask: (question) => {
      asked.push(question);
      const answer =
        question.why === 'notes'
          ? answers.notes
          : question.why === 'thoughts'
            ? answers.thoughts
            : question.why === 'to-learn'
              ? answers.toLearn
              : question.why === 'feedback'
                ? answers.feedback
                : answers.room;
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(JSON.stringify(answer));
    },
    memory,
    readSince: () => [record.join('\n')],
    mark: { get: () => marks.value, set: (ms) => (marks.value = ms) },
    notesPrompt: () => 'NOTES {{viewers}}',
    roomPrompt: () =>
      'ROOM {{memory}} {{roomUsed}} | {{streamerNote}} {{streamerUsed}} | {{digest}}',
    ...(thoughts && {
      thoughts: {
        prompt: () => 'THOUGHTS {{persona}} | {{thoughts}} | {{summary}} | {{digest}}',
        persona: () => 'Fairy',
        store: thoughtsStore,
      },
    }),
    ...(toLearn && {
      toLearn: {
        prompt: () => 'TO-LEARN {{known}} | {{open}} | {{summary}} | {{digest}}',
        list,
        known: () => toLearn.known,
      },
    }),
    ...(feedback && {
      feedback: {
        prompt: () => 'FEEDBACK {{botName}} | {{summary}} | {{digest}}',
        list: { add: (roomId, date, items) => feedback.push({ roomId, date, items }) },
        roomId: '834626631343',
      },
    }),
    streamer: { id: () => 's-1' },
    bot: { name: '默认关闭', id: 'bot' },
    isPrivate: () => isPrivate,
    log: silentLog,
    now: () => T0 + 3_600_000,
    dayOf: dayOf ?? ((ms) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10)),
    minChats: 2,
  });
  return { remember, store, asked, marks, thoughts };
}

const RECORD = [
  at(1, '主播', 'speech', '今天先唱晴天'),
  at(2, '阿拂#u-1|V', 'chat', '叫我阿拂就行'),
  at(3, '阿拂#u-1|V', 'chat', '我最爱周杰伦'),
  at(4, '路人#u-2', 'chat', '来了'),
  at(5, '默认关闭#bot', 'chat', '欢迎'),
  at(6, '默认关闭#bot', 'chat', '晚上好'),
  at(7, '咿咿#s-1', 'chat', '谢谢大家'),
  at(8, '咿咿#s-1', 'chat', '下次唱稻香'),
];

test("each regular's note gets the changes Claude names for them, the room and streamer too, and the mark moves on", async () => {
  const { remember, store, asked, marks } = setup({
    record: RECORD,
    answers: {
      notes: {
        notes: [
          {
            userId: 'u-1',
            changes: [
              { action: 'add', content: '喜欢被叫阿拂', old: '' },
              { action: 'add', content: '爱听周杰伦', old: '' },
            ],
          },
          // Someone it wasn't asked about writes nowhere.
          { userId: 'u-9', changes: [{ action: 'add', content: '编的', old: '' }] },
        ],
      },
      room: {
        room: [{ action: 'replace', content: '主播叫咿咿，外号 11', old: '主播叫咿咿' }],
        streamer: [{ action: 'add', content: '说好下次唱《稻香》', old: '' }],
      },
    },
  });
  expect(await remember.run()).toEqual({
    lines: 8,
    viewers: 1,
    changes: 4,
    failed: 0,
    thoughts: 0,
    toLearn: 0,
    feedback: 0,
  });
  expect(store.get(noteFile('s-1'))).toBe('说好下次唱《稻香》\n<!-- 2026-10-31 chat -->\n');
  expect(store.get(noteFile('u-1'))).toBe(
    '喜欢被叫阿拂\n<!-- 2026-10-31 chat -->\n§\n爱听周杰伦\n<!-- 2026-10-31 chat -->\n',
  );
  expect(store.get(noteFile('u-9'))).toBeUndefined();
  expect(store.get(ROOM_FILE)).toBe('主播叫咿咿，外号 11\n<!-- 2026-10-31 chat -->\n');
  expect(marks.value).toBe(T0 + 8000);
  // Only 阿拂 said enough: not the bot, the streamer or 路人; and no tools for the model.
  expect(asked[0]!.prompt).toContain('阿拂（userId: u-1）');
  expect(asked[0]!.prompt).not.toContain('u-2');
  expect(asked[0]!.prompt).not.toContain('默认关闭');
  expect(asked[0]!.tools).toEqual([]);
  // A few days' chat is a lot to read: each question gets 10 minutes, not the room's 4.
  expect(asked.map((q) => q.timeoutMs)).toEqual([600_000, 600_000]);
  expect(asked[1]!.prompt).toContain('今天先唱晴天');
});

test('the prompts say how full each file is, and the streamer may write up to 2000 characters', async () => {
  const { remember, store, asked } = setup({
    record: RECORD,
    answers: {
      notes: { notes: [] },
      room: {
        room: [],
        streamer: [{ action: 'add', content: '字'.repeat(1500), old: '' }],
      },
    },
  });
  store.set(noteFile('u-1'), '爱听周杰伦\n');
  expect(await remember.run()).toMatchObject({ changes: 1 });
  expect(store.get(noteFile('s-1'))).toBe(`${'字'.repeat(1500)}\n<!-- 2026-10-31 chat -->\n`);
  expect(asked[0]!.prompt).toContain('现在记着的（已用 5/1000 字）：\n爱听周杰伦');
  expect(asked[1]!.prompt).toContain('主播叫咿咿 5/4000 | （无） 0/2000');
});

test('only what came after the mark is read, and nothing new asks nothing', async () => {
  const { remember, asked } = setup({ record: RECORD, answers: {}, mark: T0 + 8000 });
  expect(await remember.run()).toMatchObject({ lines: 0 });
  expect(asked).toEqual([]);
});

test("a 私密 room gets no viewer notes; a change that can't be made is skipped", async () => {
  const { remember, store, asked } = setup({
    record: RECORD,
    isPrivate: true,
    answers: {
      room: {
        room: [
          { action: 'remove', content: '', old: '没有这条' },
          { action: 'add', content: '周五不播', old: '' },
        ],
        streamer: [],
      },
    },
  });
  expect(await remember.run()).toMatchObject({ changes: 1, failed: 0 });
  expect(asked.map((q) => q.why)).toEqual(['room']);
  expect(store.get(ROOM_FILE)).toBe('主播叫咿咿\n§\n周五不播\n<!-- 2026-10-31 chat -->\n');
});

test('a question that fails leaves the mark where it was, so the next run reads it again', async () => {
  const { remember, marks } = setup({
    record: RECORD,
    answers: { notes: { notes: [] }, room: new Error('claude failed') },
  });
  expect(await remember.run()).toMatchObject({ failed: 1 });
  expect(marks.value).toBeUndefined();
});

test('the prompts show each entry with the day it was written, and undated ones as they are', async () => {
  const { remember, store, asked } = setup({
    record: RECORD,
    answers: { notes: { notes: [] }, room: { room: [], streamer: [] } },
  });
  store.set(
    ROOM_FILE,
    '主播叫咿咿\n§\n爱唱周杰伦\n<!-- 2026-10-30 tool -->\n§\n周五不播\n<!-- 2026-10-31 chat -->\n',
  );
  await remember.run();
  expect(asked[1]!.prompt).toContain(
    '主播叫咿咿\n§\n爱唱周杰伦（2026-10-30 记）\n§\n周五不播（2026-10-31 你记）',
  );
});

test("a change to what the streamer or an admin wrote that rewrites it is skipped, as the room's policy says", async () => {
  const { remember, store } = setup({
    record: RECORD,
    answers: {
      notes: { notes: [] },
      room: {
        room: [
          { action: 'remove', content: '', old: '主播叫咿咿' },
          { action: 'replace', content: '主播叫咿咿，外号 11', old: '主播叫咿咿' },
        ],
        streamer: [],
      },
    },
  });
  expect(await remember.run()).toMatchObject({ changes: 1, failed: 0 });
  expect(store.get(ROOM_FILE)).toBe('主播叫咿咿，外号 11\n<!-- 2026-10-31 chat -->\n');
});

test("the stream's summary from Claude is kept in memory/streams.md under the day, and none when it's empty", async () => {
  const answers = (summary: string) => ({
    notes: { notes: [] },
    room: { room: [], streamer: [], summary },
  });
  const first = setup({
    record: RECORD,
    answers: answers('唱了《晴天》，\n聊了周杰伦，阿拂来了。'),
  });
  await first.remember.run();
  expect(first.store.get(STREAMS_FILE)).toBe(
    '2026-10-24：唱了《晴天》， 聊了周杰伦，阿拂来了。\n§\n',
  );
  expect(first.asked[1]!.prompt).toContain('ROOM');

  const none = setup({ record: RECORD, answers: answers('  ') });
  await none.remember.run();
  expect(none.store.has(STREAMS_FILE)).toBe(false);
});

test('a run over several days gives the span of days', async () => {
  const days = ['2026-10-23', '2026-10-24'];
  const { remember, store } = setup({
    record: RECORD,
    answers: { notes: { notes: [] }, room: { room: [], streamer: [], summary: '连着播了两天' } },
    dayOf: (ms) => days[ms < T0 + 5000 ? 0 : 1]!,
  });
  await remember.run();
  expect(store.get(STREAMS_FILE)).toBe('2026-10-23 至 2026-10-24：连着播了两天\n§\n');
});

test('then the bot says what it made of the stream, in its persona, after its earlier thoughts', async () => {
  const { remember, asked, thoughts, marks } = setup({
    record: RECORD,
    thoughts: ['2026-10-20：主人说要学新歌，不知道学会没有'],
    answers: {
      notes: { notes: [] },
      room: { room: [], streamer: [], summary: '唱了晴天' },
      thoughts: {
        thoughts: ['主人说下次唱稻香，下次问问她', '  ', '阿拂原来最爱周杰伦', '三', '四'],
      },
    },
  });
  const result = await remember.run();

  const prompt = asked.find((question) => question.why === 'thoughts')!.prompt;
  expect(prompt).toContain(
    'THOUGHTS Fairy | 2026-10-20：主人说要学新歌，不知道学会没有 | 唱了晴天 |',
  );
  expect(prompt).toContain('下次唱稻香');
  expect(asked.find((question) => question.why === 'thoughts')!.tools).toEqual([]);
  // Blank ones left out, and at most three.
  expect(thoughts).toEqual([
    '2026-10-20：主人说要学新歌，不知道学会没有',
    '2026-10-24：主人说下次唱稻香，下次问问她',
    '2026-10-24：阿拂原来最爱周杰伦',
    '2026-10-24：三',
  ]);
  expect(result.thoughts).toBe(3);
  expect(marks.value).toBe(T0 + 8000);
});

test('no thoughts asked when the room question failed, and a failed thought only logs', async () => {
  const roomDown = setup({
    record: RECORD,
    thoughts: [],
    answers: { notes: { notes: [] }, room: new Error('down'), thoughts: { thoughts: ['不该写'] } },
  });
  await roomDown.remember.run();
  expect(roomDown.asked.some((question) => question.why === 'thoughts')).toBe(false);
  expect(roomDown.thoughts).toEqual([]);

  const thinkingDown = setup({
    record: RECORD,
    thoughts: [],
    answers: {
      notes: { notes: [] },
      room: { room: [], streamer: [], summary: '' },
      thoughts: new Error('down'),
    },
  });
  const result = await thinkingDown.remember.run();
  expect(result.failed).toBe(0);
  expect(thinkingDown.marks.value).toBe(T0 + 8000);
  expect(thinkingDown.thoughts).toEqual([]);
  // Without a summary the prompt says so.
  expect(thinkingDown.asked.find((question) => question.why === 'thoughts')!.prompt).toContain(
    '| （无） |',
  );
});

test('then what it did not understand goes on the to-learn list, not what it knows or is learning', async () => {
  const toLearn = {
    text: '# 还要学的\n\n- [ ] 宇宙之心 — 是什么礼物？（手写）\n',
    known: ['灯牌', '粉丝灯牌'],
  };
  const { remember, asked } = setup({
    record: RECORD,
    toLearn,
    answers: {
      notes: { notes: [] },
      room: { room: [], streamer: [], summary: '唱了晴天' },
      toLearn: {
        items: [
          { term: '公会赛', question: '抖音直播的公会赛是什么？' },
          { term: '粉丝灯牌', question: '灯牌是什么？' },
          { term: '「宇宙之心」', question: '又问一次' },
          { term: ' ', question: '没有词' },
          ...['一', '二', '三', '四', '五'].map((term) => ({ term: `词${term}`, question: '' })),
        ],
      },
    },
  });
  const result = await remember.run();
  const prompt = asked.find((question) => question.why === 'to-learn')!;
  expect(prompt.prompt).toContain('TO-LEARN 灯牌、粉丝灯牌 | 宇宙之心 | 唱了晴天 |');
  expect(prompt.tools).toEqual([]);
  // Known and listed ones left out, at most five, each from the stream's day.
  expect(openItems(toLearn.text).map(({ term, from }) => `${term} ${from}`)).toEqual([
    '宇宙之心 手写',
    '公会赛 直播 2026-10-24',
    '词一 直播 2026-10-24',
    '词二 直播 2026-10-24',
    '词三 直播 2026-10-24',
    '词四 直播 2026-10-24',
  ]);
  expect(toLearn.text).toContain(
    '## 待学\n\n- [ ] 公会赛 — 抖音直播的公会赛是什么？（直播 2026-10-24）',
  );
  expect(result.toLearn).toBe(5);
});

test('nothing to learn is asked when the room question failed, and a failed one only logs', async () => {
  const roomDown = setup({
    record: RECORD,
    toLearn: { text: '', known: [] },
    answers: { notes: { notes: [] }, room: new Error('down') },
  });
  await roomDown.remember.run();
  expect(roomDown.asked.some((question) => question.why === 'to-learn')).toBe(false);

  const toLearn = { text: '', known: [] };
  const down = setup({
    record: RECORD,
    toLearn,
    answers: {
      notes: { notes: [] },
      room: { room: [], streamer: [], summary: '' },
      toLearn: new Error('down'),
    },
  });
  const result = await down.remember.run();
  expect(result).toMatchObject({ failed: 0, toLearn: 0 });
  expect(down.marks.value).toBe(T0 + 8000);
  expect(toLearn.text).toBe('');
});

const SLIP = {
  kind: 'knowledge',
  time: '20:00:05',
  botSaid: '欢迎',
  feedback: '阿拂：宇宙之心不是这个价',
  problem: '说错了宇宙之心的价格',
  fix: '查对宇宙之心再说',
  term: '宇宙之心',
  question: '抖音直播的宇宙之心多少钱？',
};

test('then what the audience said it got wrong goes on the feedback list, and a knowledge slip on the to-learn list too', async () => {
  const feedback: { roomId: string; date: string; items: readonly BotFeedback[] }[] = [];
  const toLearn = { text: '', known: ['宇宙之心'] };
  const { remember, asked } = setup({
    record: RECORD,
    feedback,
    toLearn,
    answers: {
      notes: { notes: [] },
      room: { room: [], streamer: [], summary: '唱了晴天' },
      toLearn: { items: [] },
      feedback: {
        items: [
          SLIP,
          {
            ...SLIP,
            kind: 'prompt',
            problem: '话太多',
            fix: '短一点',
            term: '',
            question: '',
          },
          { ...SLIP, kind: 'other', problem: '不知道哪类' },
          { ...SLIP, kind: 'program', problem: ' ' },
        ],
      },
    },
  });
  const result = await remember.run();
  const prompt = asked.find((question) => question.why === 'feedback')!;
  expect(prompt.prompt).toContain('FEEDBACK 默认关闭 | 唱了晴天 |');
  expect(prompt.prompt).toContain('默认关闭(chat) 欢迎');
  expect(prompt.tools).toEqual([]);
  // Only the kinds it knows, with a problem; term and question stay off the list.
  const slip = {
    kind: SLIP.kind,
    time: SLIP.time,
    botSaid: SLIP.botSaid,
    feedback: SLIP.feedback,
    problem: SLIP.problem,
    fix: SLIP.fix,
  };
  expect(feedback).toEqual([
    {
      roomId: '834626631343',
      date: '2026-10-24',
      items: [slip, { ...slip, kind: 'prompt', problem: '话太多', fix: '短一点' }],
    },
  ]);
  expect(result.feedback).toBe(2);
  // The knowledge base has 宇宙之心, but it was wrong about it: it's learned again.
  expect(toLearn.text).toContain(
    '- [ ] 宇宙之心 — 抖音直播的宇宙之心多少钱？（直播 2026-10-24 观众说机器人说错了）',
  );
});

test('no feedback is asked when the bot said nothing, and a failed one only logs', async () => {
  const quiet = setup({
    record: RECORD.filter((line) => !line.includes('默认关闭')),
    feedback: [],
    answers: { notes: { notes: [] }, room: { room: [], streamer: [], summary: '' } },
  });
  await quiet.remember.run();
  expect(quiet.asked.some((question) => question.why === 'feedback')).toBe(false);

  const feedback: { roomId: string; date: string; items: readonly BotFeedback[] }[] = [];
  const down = setup({
    record: RECORD,
    feedback,
    answers: {
      notes: { notes: [] },
      room: { room: [], streamer: [], summary: '' },
      feedback: new Error('down'),
    },
  });
  expect(await down.remember.run()).toMatchObject({ failed: 0, feedback: 0 });
  expect(down.marks.value).toBe(T0 + 8000);
  expect(feedback).toEqual([]);
});
