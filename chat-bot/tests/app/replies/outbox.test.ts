import { Outbox } from '../../../src/app/replies/outbox';
import type { Log } from '../../../src/app/ports';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };

test('sends replies, then system messages, then notices, at least the interval apart, and reports a failed send', async () => {
  let now = 0;
  const sentAt: [string, number][] = [];
  const failed: string[] = [];
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
  outbox.push({ kind: 'notice', text: '坏的', onFailed: () => failed.push('坏的') });
  outbox.push({ kind: 'notice', text: '提醒' });
  outbox.push({ kind: 'system', text: '系统' });
  outbox.push({ kind: 'reply', text: '二' });
  await outbox.idle();

  // '一' is already going out when the rest arrive; '二' then jumps the rest, '系统' the notices.
  expect(sentAt).toEqual([
    ['一', 0],
    ['二', 11_000],
    ['系统', 22_000],
    ['坏的', 33_000],
    ['提醒', 44_000],
  ]);
  expect(failed).toEqual(['坏的']);
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

test('a fourth notice within a minute drops the waiting ones, tells the room once, and mutes notices for five minutes', async () => {
  let now = 0;
  const sent: string[] = [];
  const outbox = new Outbox({
    send: (text) => {
      sent.push(text);
      return Promise.resolve({ echoed: true });
    },
    log: silentLog,
    intervalMs: 10_000,
    noticeFlood: {
      max: 3,
      windowMs: 60_000,
      muteMs: 300_000,
      text: () => '想让我回你的，要先送礼',
    },
    now: () => now,
    sleep: (ms) => {
      now += ms;
      return Promise.resolve();
    },
  });
  // All pushed before anything after the first is sent.
  outbox.push({ kind: 'notice', text: '@甲 送礼' }); // already going out
  outbox.push({ kind: 'notice', text: '@乙 送礼' });
  now = 59_000;
  outbox.push({ kind: 'notice', text: '@丙 送礼' });
  outbox.push({ kind: 'notice', text: '@丁 送礼' });
  outbox.push({ kind: 'reply', text: '回答' });
  now = 359_000 - 1;
  outbox.push({ kind: 'notice', text: '@戊 送礼' });
  now = 359_000;
  outbox.push({ kind: 'notice', text: '@己 送礼' });

  await outbox.idle();

  // 乙 and 丙 were waiting and 丁 was one too many; 戊 came while muted, 己 just after.
  expect(sent).toEqual(['@甲 送礼', '回答', '想让我回你的，要先送礼', '@己 送礼']);
});

test("never sends a message with a forbidden word: it fails at once, and the next one doesn't wait for it", async () => {
  let now = 0;
  const sentAt: [string, number][] = [];
  const failed: string[] = [];
  let words = ['编制'];
  const outbox = new Outbox({
    send: (text) => {
      sentAt.push([text, now]);
      return Promise.resolve({ echoed: true });
    },
    log: silentLog,
    intervalMs: 10_000,
    forbiddenWords: () => words,
    now: () => now,
    sleep: (ms) => {
      now += ms;
      return Promise.resolve();
    },
  });
  outbox.push({ kind: 'reply', text: '一' });
  outbox.push({ kind: 'reply', text: '我的编制在这', onFailed: () => failed.push('编制') });
  outbox.push({ kind: 'reply', text: '二' });
  await outbox.idle();

  expect(sentAt).toEqual([
    ['一', 0],
    ['二', 10_000],
  ]);
  expect(failed).toEqual(['编制']);

  // The list is read each time.
  words = [];
  outbox.push({ kind: 'reply', text: '编制' });
  await outbox.idle();
  expect(sentAt.at(-1)?.[0]).toBe('编制');
});
