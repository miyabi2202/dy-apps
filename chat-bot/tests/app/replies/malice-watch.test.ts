import { MaliceWatch } from '../../../src/app/replies/malice-watch';
import type { IncomingChat } from '../../../src/core/chat/room-events';
import { ChatHistory } from '../../../src/core/chat/chat-history';
import { fakeRoom } from '../../support/fake-room';
import { silentLog } from '../../support/fakes';

/**
 * A watch whose Jev scores each chat by `scores` (0 when not listed) and whose model finds
 * malicious the chats in `malicious`.
 */
function setup(scores: Record<string, number>, malicious: string[], answer?: string) {
  let now = 0;
  const history = new ChatHistory(100);
  const sent: string[] = [];
  const prompts: string[] = [];
  const watch = new MaliceWatch({
    judge: (state) =>
      Promise.resolve({ malice: scores[state.replace('抖音直播间弹幕：', '')] ?? 0 }),
    ask: ({ prompt }) => {
      prompts.push(prompt);
      const text = prompt.match(/【要判断的弹幕】[^：]*：(.*)/)?.[1] ?? '';
      return Promise.resolve(
        answer ?? JSON.stringify({ malicious: malicious.includes(text), reason: '' }),
      );
    },
    promptTemplate: () => '{{history}}\n{{userChat}}\n【要判断的弹幕】{{asker}}：{{question}}',
    outbox: { push: ({ text }) => sent.push(text) },
    room: fakeRoom({ history, now: () => now }),
    exempt: (userId) => userId === 'streamer',
    log: silentLog,
    on: true,
  });
  /** `nickname` (user id `userId`) chats `content` at `at` seconds. */
  const say = async (at: number, userId: string, nickname: string, content: string) => {
    now = at * 1000;
    const chat: IncomingChat = { ts: now, userId, nickname, content, mentions: [] };
    history.add(chat);
    watch.hear(chat);
    await watch.idle();
  };
  return { watch, say, sent, prompts };
}

// A 私密 room's viewer, as the adapter gives them.
const HIDDEN = '111111-不***-25';

test('@s whoever sends a chat the model finds malicious, among those Jev lets through', async () => {
  const bad = ['玩的还很花[看]', '主包是劳女[比心]', '主包玩的比较花[调皮]'] as const;
  const { say, sent, prompts } = setup(
    { [bad[0]]: 0.77, [bad[1]]: 0.74, [bad[2]]: 0.69, 笑死: 0.04 },
    [bad[1], bad[2]],
  );
  await say(10, 'u-2', 'C***', '笑死');
  await say(20, HIDDEN, '不***', bad[0]);
  expect(sent).toEqual([]);
  await say(50, HIDDEN, '不***', bad[1]);
  await say(60, HIDDEN, '不***', bad[2]);
  expect(sent).toEqual(['@不*** 检测到恶意言论', '@不*** 检测到恶意言论']);
  // Jev let 笑死 go by, so the model never saw it; it sees what came before, and the viewer's own.
  expect(prompts).toHaveLength(3);
  expect(prompts[2]).toContain('C***: 笑死');
  expect(prompts[2]).toContain(`${bad[0]}\n${bad[1]}\n【要判断的弹幕】不***：${bad[2]}`);
});

test('an answer that is not JSON, and admins, count for nothing', async () => {
  const { say, sent } = setup({ 滚: 0.9 }, ['滚']);
  await say(0, 'streamer', '主播', '滚');
  expect(sent).toEqual([]);

  const unsure = setup({ 滚: 0.9 }, [], '我觉得是恶意的');
  await unsure.say(0, 'u-1', '甲', '滚');
  expect(unsure.sent).toEqual([]);
});

test('turned off, it stops', async () => {
  const { watch, say, sent } = setup({ 滚: 0.9 }, ['滚']);
  watch.on = false;
  await say(0, 'u-1', '甲', '滚');
  await say(1, 'u-1', '甲', '滚');
  expect(sent).toEqual([]);
});
