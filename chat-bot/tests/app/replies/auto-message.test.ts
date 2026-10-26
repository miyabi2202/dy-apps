import { AutoMessage } from '../../../src/app/replies/auto-message';
import { silentLog } from '../../support/fakes';

/** An AutoMessage starting at `intervalSeconds`, saying `message`, at a clock the test moves. */
function setup(intervalSeconds: number, message: string | undefined = '点点关注不迷路') {
  let now = 0;
  let text: string | undefined = message;
  const sent: string[] = [];
  const auto = new AutoMessage({
    message: () => text,
    intervalSeconds,
    outbox: { push: (m) => sent.push(`${m.kind}:${m.text}`) },
    log: silentLog,
    now: () => now,
  });
  /** Moves the clock to `at` seconds and looks whether it's time. */
  const at = (seconds: number) => {
    now = seconds * 1000;
    auto.tick();
  };
  return { auto, at, sent, setMessage: (m: string | undefined) => (text = m) };
}

test('says the message every interval, the first one interval after it starts', () => {
  const { at, sent } = setup(60);
  at(0);
  at(59);
  expect(sent).toEqual([]);
  at(60);
  at(100);
  at(120);
  expect(sent).toEqual(['talk:点点关注不迷路', 'talk:点点关注不迷路']);
});

test('says nothing at 0 or without a message, and counts afresh once turned on', () => {
  const { auto, at, sent, setMessage } = setup(0);
  at(0);
  at(1000);
  expect(sent).toEqual([]);
  auto.intervalSeconds = 30;
  at(1010);
  at(1039);
  expect(sent).toEqual([]);
  at(1040);
  expect(sent).toEqual(['talk:点点关注不迷路']);
  setMessage(undefined);
  at(2000);
  expect(sent).toHaveLength(1);
});
