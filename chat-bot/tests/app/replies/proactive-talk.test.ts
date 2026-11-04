import { finalScore, ProactiveTalk, type Thought } from '../../../src/app/replies/proactive-talk';
import type { Question } from '../../../src/app/ports';
import { fakeRoom } from '../../support/fake-room';
import { fakeSettings } from '../../support/fake-settings';
import { silentLog } from '../../support/fakes';

const answer = (...thoughts: Thought[]) => JSON.stringify({ thoughts });
const thought = (say: string, score: number, sameTopic = false): Thought => ({
  thought: `想说${say}`,
  score,
  sameTopic,
  say,
});

/** ProactiveTalk every `minutes`, whose Claude gives `answers` in turn, at a clock the test moves. */
function setup(minutes: number, answers: string[]) {
  let now = 0;
  const settings = fakeSettings({ proactiveTalkMinutes: minutes });
  const sent: string[] = [];
  const prompts: string[] = [];
  const talk = new ProactiveTalk({
    ask: (question: Question) => {
      prompts.push(question.prompt);
      return Promise.resolve(answers.shift() ?? answer());
    },
    outbox: { push: (m) => sent.push(`${m.kind}:${m.text}`) },
    promptTemplate: () => '想一想，上一轮：{{lastThoughts}}，{{singleLength}} 字以内',
    room: fakeRoom({ now: () => now }),
    settings,
    log: silentLog,
    sleep: () => new Promise(() => {}),
  });
  void talk.loop();
  /** Moves the clock to `minutes` and looks whether it's time. */
  const at = (minutes: number) => {
    now = minutes * 60_000;
    return talk.tick();
  };
  /** Someone chats at `minutes`. */
  const chatAt = (minutes: number) => {
    now = minutes * 60_000;
    talk.heardChat();
  };
  return { settings, at, chatAt, sent, prompts };
}

test('the final score: less 0.2 on the same topic, plus 0.025 a quiet minute up to 0.3, within 0 to 1', () => {
  expect(finalScore({ score: 0.7, sameTopic: false }, 0)).toBe(0.7);
  expect(finalScore({ score: 0.7, sameTopic: true }, 0)).toBe(0.5);
  expect(finalScore({ score: 0.5, sameTopic: false }, 2.9)).toBe(0.55);
  expect(finalScore({ score: 0.5, sameTopic: false }, 30)).toBe(0.8);
  expect(finalScore({ score: 0.9, sameTopic: false }, 30)).toBe(1);
  expect(finalScore({ score: 0.1, sameTopic: true }, 0)).toBe(0);
});

test('thinks every interval, even with chat, and says the best thought once its final score is enough', async () => {
  const { at, chatAt, sent, prompts } = setup(5, [
    answer(
      thought('六分街也降温了', 0.7, true),
      thought('这首副歌好上头', 0.65),
      thought(' ', 0.99),
    ),
    answer(thought('还是这首副歌', 0.8, true)),
  ]);
  await at(0);
  chatAt(4.5);
  await at(4.9);
  expect(prompts).toEqual([]);
  await at(5);
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('上一轮：（这是这次开播第一次想，没有上一轮）');
  // 0.7 on the same topic is 0.5; the blank one has nothing to say.
  expect(sent).toEqual(['talk:这首副歌好上头']);
  chatAt(9);
  await at(10);
  expect(prompts[1]).toContain(
    '上一轮：- 想说六分街也降温了\n- 想说这首副歌好上头（说出去了：这首副歌好上头）\n- 想说 ，',
  );
  // 0.8 less 0.2, and a minute's quiet is 0.025 more: 0.625.
  expect(sent).toEqual(['talk:这首副歌好上头', 'talk:还是这首副歌']);
});

test('a long quiet lifts a low score over the line', async () => {
  const { at, sent } = setup(10, [answer(thought('小黑蜷在散热口', 0.4))]);
  await at(0);
  await at(10);
  // Ten quiet minutes since it started: 0.4 + 0.25.
  expect(sent).toEqual(['talk:小黑蜷在散热口']);
});

test('keeps quiet when nothing scores enough', async () => {
  const { at, chatAt, sent, prompts } = setup(5, [answer(thought('跟眼前没关系', 0.4))]);
  await at(0);
  chatAt(4);
  await at(5);
  expect(prompts).toHaveLength(1);
  expect(sent).toEqual([]);
});

test('thinks nothing at 0, and counts afresh once turned on', async () => {
  const { settings, at, prompts } = setup(0, []);
  await at(0);
  await at(100);
  expect(prompts).toEqual([]);
  settings.set({ proactiveTalkMinutes: 2 });
  await at(101);
  await at(102.9);
  expect(prompts).toEqual([]);
  await at(103);
  expect(prompts).toHaveLength(1);
});
