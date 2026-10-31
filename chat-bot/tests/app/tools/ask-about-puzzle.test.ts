import { Screenshots } from '../../../src/app/room/screenshots';
import type { AskModel, Question, UserTalk } from '../../../src/app/ports';
import type { SolveEffort } from '../../../src/core/commands/settings';
import { SETTING_DEFAULTS } from '../../../src/core/commands/settings';
import { MESSAGE_SCHEMA } from '../../../src/core/replies/mention-answer';
import { askAboutPuzzleTool } from '../../../src/app/tools/ask-about-puzzle';
import { fakeRoom } from '../../support/fake-room';
import { fakeSettings } from '../../support/fake-settings';
import { fakeBus, fakeOutbox, silentLog } from '../../support/fakes';

const FRAME = new Uint8Array([0xff, 0xd8]);

function setup() {
  const asked: { effort: SolveEffort; question: Question }[] = [];
  const answers: ((answer: string) => void)[] = [];
  const failures: ((error: Error) => void)[] = [];
  const ask = (effort: SolveEffort): AskModel => {
    return (question) =>
      new Promise<string>((resolve, reject) => {
        asked.push({ effort, question });
        answers.push(resolve);
        failures.push(reject);
      });
  };
  const state = { solveEffort: 'medium' as SolveEffort };
  const { outbox, sent } = fakeOutbox();
  const talk: { userId: string; answer: string }[] = [];
  const userTalk: UserTalk = {
    add: (userId, { answer }) => void talk.push({ userId, answer }),
    recent: () => '',
  };
  const answered: string[] = [];
  const bus = fakeBus();
  bus.on('answered', ({ userId }) => void answered.push(userId));
  const tool = askAboutPuzzleTool({
    ask,
    settings: { get: () => ({ ...SETTING_DEFAULTS, solveEffort: state.solveEffort }) },
    prompt: () => '解题：{{question}}（{{asker}}）',
    // Screenshots are off, but a puzzle always gets one.
    room: fakeRoom(),
    screenshots: new Screenshots({
      fetch: () => Promise.resolve(FRAME),
      settings: fakeSettings({ screenshots: false }),
      log: silentLog,
    }),
    outbox,
    userTalk,
    bus,
    maxLength: 49,
    log: silentLog,
  });
  const call = (question: string) =>
    tool.call(
      { question },
      { asker: '阿明', userId: 'u-阿明', question: `/解题 ${question}`, admin: true },
    );
  return { tool, call, asked, answers, failures, state, sent, outbox, talk, answered };
}

test('returns at once, before Codex has answered, and sends the answer to the asker when it comes', async () => {
  const { tool, call, answers, sent, outbox, talk, answered } = setup();
  const result = await call('这题选什么');
  expect(JSON.parse(result.text)).toEqual({ started: true, effort: 'medium', screenshot: true });
  expect(sent).toEqual([]);

  answers[0]!(JSON.stringify({ message: '选C，按面积分' }));
  await tool.idle();
  await outbox.idle();
  expect(sent).toEqual(['@阿明 选C，按面积分']);
  expect(talk).toEqual([{ userId: 'u-阿明', answer: '@阿明 选C，按面积分' }]);
  expect(answered).toEqual(['u-阿明']);
});

test('the room’s solveEffort at the time of the call picks the model', async () => {
  const { call, asked, state } = setup();
  await call('第一题');
  state.solveEffort = 'high';
  await call('第二题');
  expect(asked.map(({ effort }) => effort)).toEqual(['medium', 'high']);
});

test('asks with the question in the prompt, the screenshot attached, and the message schema', async () => {
  const { call, asked } = setup();
  await call('提示一下');
  const { question } = asked[0]!;
  expect(question.prompt).toBe('解题：提示一下（阿明）');
  expect(question.image).toBe(FRAME);
  expect(question.schema).toEqual(MESSAGE_SCHEMA);
});

test('a Codex that fails is reported to the asker, and so is one with nothing to say', async () => {
  const { tool, call, failures, answers, sent, outbox, talk } = setup();
  await call('这题选什么');
  failures[0]!(new Error('codex failed'));
  await tool.idle();
  await outbox.idle();
  expect(sent).toEqual(['@阿明 这题我没做出来，等会儿再试一次吧。']);

  await call('这题呢');
  answers[1]!(JSON.stringify({ message: '' }));
  await tool.idle();
  await outbox.idle();
  expect(sent[1]).toBe('@阿明 这题我看不清、也没算出来，拿不准就不瞎说了。');
  expect(talk).toEqual([]);
});

test('a question that is not text is an error, and Codex is not asked', async () => {
  const { tool, asked } = setup();
  const result = await tool.call({ question: 3 }, { asker: '阿明', question: '' });
  expect(result.isError).toBe(true);
  expect(asked).toEqual([]);
});

test('/解题 passes what follows as the question and says nothing until the answer comes', () => {
  const { tool } = setup();
  const [command] = tool.commands!;
  expect(command!.name).toBe('解题');
  expect(command!.parse('这题选什么')).toEqual({ args: { question: '这题选什么' } });
  expect(command!.parse('')).toEqual({ args: { question: '' } });
  expect(command!.say({ text: '{}' }, {})).toBe('');
});
