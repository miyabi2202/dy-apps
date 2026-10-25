import { Outbox } from '../../../src/app/replies/outbox';
import type { Log } from '../../../src/app/ports';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };

test('sends replies, then system messages, then unprompted talk, at least the interval apart, past a failed send', async () => {
  let now = 0;
  const sentAt: [string, number][] = [];
  const delivered: string[] = [];
  const outbox = new Outbox({
    send: (text) => {
      sentAt.push([text, now]);
      now += 1_000; // room-feed takes a second to type and confirm
      return text === '坏的'
        ? Promise.reject(new Error('风控'))
        : Promise.resolve({ echoed: true });
    },
    log: silentLog,
    onSent: ({ text }) => delivered.push(text),
    intervalMs: 10_000,
    now: () => now,
    sleep: (ms) => {
      now += ms;
      return Promise.resolve();
    },
  });
  outbox.push({ kind: 'reply', text: '一' });
  outbox.push({ kind: 'talk', text: '坏的' });
  outbox.push({ kind: 'talk', text: '提醒' });
  outbox.push({ kind: 'system', text: '系统' });
  outbox.push({ kind: 'reply', text: '二' });
  await outbox.idle();

  // '一' is already going out when the rest arrive; '二' then jumps the rest, '系统' the talk.
  expect(sentAt).toEqual([
    ['一', 0],
    ['二', 11_000],
    ['系统', 22_000],
    ['坏的', 33_000],
    ['提醒', 44_000],
  ]);
  expect(delivered).toEqual(['一', '二', '系统', '提醒']);
});

test("tells a message's own onSent once it's sent, at its turn, and not when sending fails", async () => {
  let now = 0;
  const told: [string, number][] = [];
  const outbox = new Outbox({
    send: (text) =>
      text === '坏的' ? Promise.reject(new Error('风控')) : Promise.resolve({ echoed: true }),
    log: silentLog,
    intervalMs: 10_000,
    now: () => now,
    sleep: (ms) => {
      now += ms;
      return Promise.resolve();
    },
  });
  for (const text of ['一', '坏的', '二']) {
    outbox.push({ kind: 'reply', text, onSent: () => told.push([text, now]) });
  }
  await outbox.idle();

  expect(told).toEqual([
    ['一', 0],
    ['二', 20_000],
  ]);
});

test('swaps a forbidden word left in a message, reading the words each time', async () => {
  const sent: string[] = [];
  let words: Record<string, string> = { 编制: '', 酒: '8+1' };
  const outbox = new Outbox({
    send: (text) => {
      sent.push(text);
      return Promise.resolve({ echoed: true });
    },
    log: silentLog,
    intervalMs: 0,
    forbiddenWords: () => words,
  });
  outbox.push({ kind: 'reply', text: '@编制君 少喝酒' });
  await outbox.idle();
  words = {};
  outbox.push({ kind: 'reply', text: '编制' });
  await outbox.idle();

  expect(sent).toEqual(['@**君 少喝8+1', '编制']);
});
