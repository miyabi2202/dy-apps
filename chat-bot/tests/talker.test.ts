import type { Log } from '../src/app/ports';
import { Talker } from '../src/app/talker';
import type { ChatLine } from '../src/core/room-events';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };
const MINUTE = 60_000;

test('joins in the chat each interval, and stays quiet when only it has chatted since', async () => {
  let now = 0;
  const chat: ChatLine[] = [];
  const prompts: string[] = [];
  const sent: { kind: string; text: string }[] = [];
  const answers = ['火锅必须配冰粉啊\n\nSources:\n- x', '奶茶还是要三分糖'];
  // Each wait is one interval: the chat changes during it, then the talker wakes.
  const rounds = [
    () => chat.push({ ts: now, nickname: '阿明', content: '今晚吃火锅' }),
    () => chat.push({ ts: now, nickname: '小助手', content: '火锅必须配冰粉啊' }),
    () => chat.push({ ts: now, nickname: '小红', content: '我要喝奶茶' }),
  ];
  let talker: Talker | null = null;
  talker = new Talker({
    ask: ({ prompt }) => {
      prompts.push(prompt);
      return Promise.resolve(answers.shift() ?? '');
    },
    outbox: { push: (message) => sent.push(message) },
    promptTemplate: '{{botName}}|{{history}}',
    intervalMs: 3 * MINUTE,
    recentChat: () => chat,
    botName: '小助手',
    log: silentLog,
    now: () => now,
    sleep: (ms) => {
      now += ms;
      const round = rounds.shift();
      if (round) round();
      else talker?.stop();
      return Promise.resolve();
    },
  });
  await talker.run();

  // The second round only has the bot's own message, so it's skipped.
  expect(prompts).toEqual([
    '小助手|阿明: 今晚吃火锅',
    '小助手|阿明: 今晚吃火锅\n小助手: 火锅必须配冰粉啊\n小红: 我要喝奶茶',
  ]);
  expect(sent).toEqual([
    { kind: 'talk', text: '火锅必须配冰粉啊' },
    { kind: 'talk', text: '奶茶还是要三分糖' },
  ]);
});
