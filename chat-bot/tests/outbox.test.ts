import type { BotLog } from '../src/chat-bot';
import { Outbox } from '../src/outbox';

const silentLog: BotLog = { debug() {}, info() {}, warn() {}, error() {} };

test('sends in order, at least the interval apart, and reports a failed send', async () => {
  let now = 0;
  const sentAt: [string, number][] = [];
  const failed: string[] = [];
  const outbox = new Outbox({
    send: (text) => {
      sentAt.push([text, now]);
      now += 1_000; // DyHub takes a second to type and confirm
      return text === '坏的'
        ? Promise.reject(new Error('风控'))
        : Promise.resolve({ echoed: true });
    },
    log: silentLog,
    intervalMs: 10_000,
    now: () => now,
    sleep: (ms) => {
      now += ms;
      return Promise.resolve();
    },
  });
  outbox.push({ kind: 'reply', text: '一' });
  outbox.push({ kind: 'notice', text: '坏的', onFailed: () => failed.push('坏的') });
  outbox.push({ kind: 'reply', text: '三' });
  await outbox.idle();

  expect(sentAt).toEqual([
    ['一', 0],
    ['坏的', 11_000],
    ['三', 22_000],
  ]);
  expect(failed).toEqual(['坏的']);
});
