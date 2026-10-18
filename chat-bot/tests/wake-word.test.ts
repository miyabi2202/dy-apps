import { WakeWord } from '../src/app/wake-word';
import { silentLog } from './fakes';

test('wakes on the streamer saying the phrase, not singing it or a guest, then rests a minute', () => {
  let now = 0;
  let woken = 0;
  const wakeWord = new WakeWord({
    phrase: '我想吃鱼了',
    wake: () => Promise.resolve(woken++),
    now: () => now,
    log: silentLog,
  });
  const say = (text: string, line: { speech?: number; host?: boolean } = {}) =>
    wakeWord.hear({ start: now, end: now, text, ...line });

  say('今天好累啊');
  say('我想吃鱼了', { speech: 0.05 }); // sung
  say('我想吃鱼了', { host: false }); // the guest
  expect(woken).toBe(0);

  say('好饿，我想吃鱼了。', { host: true });
  expect(woken).toBe(1);
  now += 30_000;
  say('我想吃 鱼了');
  expect(woken).toBe(1);
  now += 30_000;
  say('我想吃 鱼了'); // line too short for the voiceprint: no host either way
  expect(woken).toBe(2);
});

test('an empty phrase never wakes it', () => {
  let woken = 0;
  const wakeWord = new WakeWord({
    phrase: '',
    wake: () => Promise.resolve(woken++),
    log: silentLog,
  });
  wakeWord.hear({ start: 0, end: 0, text: '我想吃鱼了' });
  expect(woken).toBe(0);
});
