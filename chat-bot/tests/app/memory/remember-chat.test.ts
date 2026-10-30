import type { Memory, Question } from '../../../src/app/ports';
import { RememberChat } from '../../../src/app/memory/remember-chat';

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
}: {
  record: string[];
  answers: { notes?: unknown; room?: unknown };
  mark?: number;
  isPrivate?: boolean;
}) {
  const store = { room: '主播叫咿咿\n', notes: { 's-1': '' } as Record<string, string> };
  const memory: Memory = {
    room: () => store.room,
    setRoom: (text) => (store.room = text),
    note: (userId) => store.notes[userId] ?? '',
    setNote: (userId, text) => (store.notes[userId] = text),
  };
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
    roomPrompt: () => 'ROOM {{memory}} | {{streamerNote}} | {{digest}}',
    streamerId: () => 's-1',
    bot: { name: '默认关闭', id: 'bot' },
    isPrivate: () => isPrivate,
    log: silentLog,
    now: () => T0 + 3_600_000,
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
  expect(store.notes).toEqual({
    's-1': '说好下次唱《稻香》\n',
    'u-1': '喜欢被叫阿拂\n§\n爱听周杰伦\n',
  });
  expect(store.room).toBe('主播叫咿咿，外号 11\n');
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
  expect(store.room).toBe('主播叫咿咿\n§\n周五不播\n');
});

test('a question that fails leaves the mark where it was, so the next run reads it again', async () => {
  const { remember, marks } = setup({
    record: RECORD,
    answers: { notes: { notes: [] }, room: new Error('claude failed') },
  });
  expect(await remember.run()).toMatchObject({ failed: 1 });
  expect(marks.value).toBeUndefined();
});
