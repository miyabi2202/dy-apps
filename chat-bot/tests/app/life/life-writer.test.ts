import { LifeWriter } from '../../../src/app/life/life-writer';
import type { LifeDay, LifeLog, Question } from '../../../src/app/ports';
import { silentLog } from '../../support/fakes';

/** A life log in memory. */
function fakeLife(
  days: Record<string, LifeDay[]> = {},
): LifeLog & { days: Record<string, LifeDay[]> } {
  return {
    days,
    recent: (persona, count) => (days[persona] ?? []).slice(-count),
    has: (persona, date) => (days[persona] ?? []).some((day) => day.date === date),
    add(persona, date, text) {
      if (this.has(persona, date)) return false;
      (days[persona] ??= []).push({ date, text });
      return true;
    },
  };
}

/** 2026-10-31 10:00 in Beijing. */
const SATURDAY = Date.UTC(2026, 9, 31, 2, 0, 0);

function setup({
  answer = '{"entries":["小黑趴在招财布旁边睡了一下午","141 的「找零」又找错了钱"]}',
  life = fakeLife(),
  persona = 'fairy',
  guide = '六分街的设定',
}: {
  answer?: string;
  life?: ReturnType<typeof fakeLife>;
  /** The shared persona the room plays; null for none. */
  persona?: string | null;
  /** Her guide; null for none. */
  guide?: string | null;
} = {}) {
  let now = SATURDAY;
  const questions: Question[] = [];
  let reply = () => Promise.resolve(answer);
  const writer = new LifeWriter({
    ask: (question) => {
      questions.push(question);
      return reply();
    },
    promptTemplate: () =>
      '人设：{{persona}}\n设定：{{guide}}\n最近：\n{{recentLife}}\n今天：{{today}}',
    life,
    persona: () => persona ?? undefined,
    personaText: (name) => `${name} 的人设`,
    guide: () => guide,
    timeZone: () => 'Asia/Shanghai',
    log: silentLog,
    now: () => now,
  });
  return {
    writer,
    life,
    questions,
    at: (ms: number) => (now = ms),
    failNext: () => (reply = () => Promise.reject(new Error('claude is down'))),
    answerNext: () => (reply = () => Promise.resolve(answer)),
  };
}

test("writes today once, from her persona, her guide and her latest days, in the room's time zone", async () => {
  const life = fakeLife({ fairy: [{ date: '2026-10-30', text: '- 昨天下雨' }] });
  const { writer, questions } = setup({ life });
  await writer.tick();
  await writer.tick();

  expect(questions).toHaveLength(1);
  expect(questions[0]!.prompt).toBe(
    '人设：fairy 的人设\n设定：六分街的设定\n最近：\n### 2026-10-30\n\n- 昨天下雨\n今天：2026-10-31 星期六',
  );
  // Writing her day needs no web search or files.
  expect(questions[0]!.tools).toEqual([]);
  expect(life.days.fairy).toEqual([
    { date: '2026-10-30', text: '- 昨天下雨' },
    { date: '2026-10-31', text: '- 小黑趴在招财布旁边睡了一下午\n- 141 的「找零」又找错了钱' },
  ]);
});

test('the next day is written once it comes; a day with no days before says so', async () => {
  const { writer, questions, at, life } = setup();
  await writer.tick();
  expect(questions[0]!.prompt).toContain('最近：\n（还没有）');
  // 2026-11-01 00:30 in Beijing, still 10-31 in UTC.
  at(Date.UTC(2026, 9, 31, 16, 30));
  await writer.tick();
  expect(questions).toHaveLength(2);
  expect(life.days.fairy!.map((day) => day.date)).toEqual(['2026-10-31', '2026-11-01']);
});

test('nothing for a persona without a guide, or a room playing no shared persona', async () => {
  const noGuide = setup({ guide: null });
  await noGuide.writer.tick();
  expect(noGuide.questions).toEqual([]);

  const noPersona = setup({ persona: null });
  await noPersona.writer.tick();
  expect(noPersona.questions).toEqual([]);
});

test('a day another bot wrote first is kept, and a failed or empty answer is tried again later', async () => {
  const taken = fakeLife({ fairy: [{ date: '2026-10-31', text: '- 别的直播间写的' }] });
  const other = setup({ life: taken });
  await other.writer.tick();
  expect(other.questions).toEqual([]);

  const { writer, questions, life, failNext, answerNext } = setup();
  failNext();
  await writer.tick();
  expect(life.days.fairy).toBeUndefined();
  answerNext();
  await writer.tick();
  expect(questions).toHaveLength(2);
  expect(life.days.fairy).toHaveLength(1);

  const empty = setup({ answer: '{"entries":["  "]}' });
  await empty.writer.tick();
  expect(empty.life.days.fairy).toBeUndefined();
});
