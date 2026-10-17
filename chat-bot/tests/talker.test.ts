import type { Log } from '../src/app/ports';
import { Talker } from '../src/app/talker';
import type { ChatLine } from '../src/core/room-events';
import { Transcript } from '../src/core/transcript';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };
const MINUTE = 60_000;

test('says one message each interval from what is going on, and stays quiet in a quiet room', async () => {
  let now = 0;
  const transcript = new Transcript(Infinity, () => now);
  const chat: ChatLine[] = [];
  const prompts: string[] = [];
  const sent: { kind: string; text: string }[] = [];
  const answers = ['主播这首歌唱得好有感觉，是原唱的调吗？\n\nSources:\n- x', '我也想吃火锅'];
  // Each wait is one interval: the room changes during it, then the talker wakes.
  const rounds = [
    () => transcript.add({ start: now - 3000, end: now, text: '寒江陪烟火', speech: 0.05 }),
    () => {}, // nothing said or chatted
    () => chat.push({ ts: now, nickname: '阿明', content: '今晚吃火锅' }),
  ];
  let talker: Talker | null = null;
  talker = new Talker({
    ask: ({ prompt }) => {
      prompts.push(prompt);
      return Promise.resolve(answers.shift() ?? '');
    },
    outbox: { push: (message) => sent.push(message) },
    promptTemplate: '{{botName}}|{{transcript}}|{{history}}',
    intervalMs: 3 * MINUTE,
    recentChat: () => chat,
    transcript,
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

  expect(prompts).toEqual([
    '小助手|00:02:57 （唱）寒江陪烟火|（暂无）',
    // The sung line is over 5 minutes old by then.
    '小助手|（暂无）|阿明: 今晚吃火锅',
  ]);
  expect(sent).toEqual([
    { kind: 'talk', text: '主播这首歌唱得好有感觉，是原唱的调吗？' },
    { kind: 'talk', text: '我也想吃火锅' },
  ]);
});
