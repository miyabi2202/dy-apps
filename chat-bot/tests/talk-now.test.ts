import type { Log } from '../src/app/ports';
import { TalkNow, WOKEN } from '../src/app/talk-now';
import { fakeRoom } from './fake-room';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };

function setup(answer: string) {
  const prompts: string[] = [];
  const sent: { kind: string; text: string }[] = [];
  const onSaid = jest.fn();
  const talkNow = new TalkNow({
    ask: ({ prompt }) => {
      prompts.push(prompt);
      return Promise.resolve(answer);
    },
    outbox: { push: (message) => sent.push(message) },
    promptTemplate: () => '{{question}}|{{transcript}}',
    room: fakeRoom(),
    log: silentLog,
    onSaid,
  });
  return { talkNow, prompts, sent, onSaid };
}

test('the wake word talks now, telling Claude why, and an answer that is not JSON is sent as it is', async () => {
  const { talkNow, prompts, sent, onSaid } = setup('主播今天好可爱');

  expect(await talkNow.say('reply', WOKEN)).toBe('主播今天好可爱');
  expect(prompts).toEqual(['主播说了唤醒词。|（暂无）']);
  expect(sent).toEqual([{ kind: 'reply', text: '主播今天好可爱' }]);
  expect(onSaid).toHaveBeenCalledTimes(1);
});

test('says nothing, and tells no one, when Claude sees no need to', async () => {
  const { talkNow, sent, onSaid } = setup(JSON.stringify({ reply: false, message: '' }));

  expect(await talkNow.say('reply', WOKEN)).toBeNull();
  expect(sent).toEqual([]);
  expect(onSaid).not.toHaveBeenCalled();
});
