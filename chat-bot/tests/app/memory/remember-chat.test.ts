import type { Question } from '../../../src/app/ports';
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
}: {
  record: string[];
  answers: { notes?: unknown; room?: unknown };
  mark?: number;
  isPrivate?: boolean;
  dayOf?: (ms: number) => string;
}) {
  const { memory, store } = fakeMemory({ [ROOM_FILE]: '主播叫咿咿\n' });
  const asked: Question[] = [];
  const marks = { value: mark };
  const remember = new RememberChat({
    ask: (question) => {
      asked.push(question);
      const answer = question.why === 'notes' ? answers.notes : answers.room;
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
    streamerId: () => 's-1',
    bot: { name: '默认关闭', id: 'bot' },
    isPrivate: () => isPrivate,
    log: silentLog,
    now: () => T0 + 3_600_000,
    dayOf: dayOf ?? ((ms) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10)),
    minChats: 2,
  });
  return { remember, store, asked, marks };
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
  expect(await remember.run()).toEqual({ lines: 8, viewers: 1, changes: 4, failed: 0 });
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
