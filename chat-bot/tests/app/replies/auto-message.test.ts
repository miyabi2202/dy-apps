import { AutoMessage } from '../../../src/app/replies/auto-message';
import type { Question } from '../../../src/app/ports';
import { fakeRoom } from '../../support/fake-room';
import { fakeSettings } from '../../support/fake-settings';
import { silentLog } from '../../support/fakes';

/** An AutoMessage starting at `intervalSeconds`, whose Claude gives `answers` in turn, at a clock the test moves. */
function setup(intervalSeconds: number, answers: string[]) {
  let now = 0;
  const settings = fakeSettings({ autoMessageIntervalSeconds: intervalSeconds });
  const sent: string[] = [];
  const prompts: string[] = [];
  const auto = new AutoMessage({
    ask: (question: Question) => {
      prompts.push(question.prompt);
      return Promise.resolve(answers.shift() ?? '{"message":""}');
    },
    outbox: { push: (m) => sent.push(`${m.kind}:${m.text}`) },
    promptTemplate: () => '说点什么，{{singleLength}} 字以内',
    room: fakeRoom(),
    settings,
    log: silentLog,
    now: () => now,
  });
  /** Moves the clock to `at` seconds and looks whether it's time. */
  const at = (seconds: number) => {
    now = seconds * 1000;
    return auto.tick();
  };
  return { auto, settings, at, sent, prompts };
}

test('asks Claude every interval, the first time one interval after it starts, and sends what it says', async () => {
  const { at, sent, prompts } = setup(60, ['{"message":"第一条"}', '{"message":""}']);
  await at(0);
  await at(59);
  expect(prompts).toEqual([]);
  await at(60);
  await at(100);
  await at(120);
  expect(prompts).toHaveLength(2);
  expect(prompts[0]).toContain('说点什么');
  // The second time Claude chose to say nothing.
  expect(sent).toEqual(['talk:第一条']);
});

test('asks nothing at 0, and counts afresh once turned on', async () => {
  const { settings, at, prompts } = setup(0, []);
  await at(0);
  await at(1000);
  expect(prompts).toEqual([]);
  settings.set({ autoMessageIntervalSeconds: 30 });
  await at(1010);
  await at(1039);
  expect(prompts).toEqual([]);
  await at(1040);
  expect(prompts).toHaveLength(1);
});
