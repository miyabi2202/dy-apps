import { WakeWord } from '../src/app/wake-word';
import type { WakeWords } from '../src/app/ports';
import { silentLog } from './fakes';

/** Wake words kept in memory, starting at `phrase`. */
function fixedWords(phrase: string): WakeWords {
  return { get: () => phrase, set: (next) => (phrase = next) };
}

test('wakes on the streamer saying the phrase, not singing it or a guest, then rests a minute', () => {
  let now = 0;
  let woken = 0;
  const wakeWord = new WakeWord({
    words: fixedWords('我想吃鱼了'),
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
  say('我想吃余了'); // misheard, and too short for the voiceprint: no host either way
  expect(woken).toBe(2);
});

test('an empty phrase never wakes it', () => {
  let woken = 0;
  const wakeWord = new WakeWord({
    words: fixedWords(''),
    wake: () => Promise.resolve(woken++),
    log: silentLog,
  });
  wakeWord.hear({ start: 0, end: 0, text: '我想吃鱼了' });
  expect(woken).toBe(0);
});

test('/设置唤醒词 changes the wake word at once, and needs some Chinese', () => {
  let woken = 0;
  const words = fixedWords('我想吃鱼了');
  const wakeWord = new WakeWord({ words, wake: () => Promise.resolve(woken++), log: silentLog });
  const setWord = (args: string) =>
    wakeWord
      .commands()
      .find((command) => command.name === '设置唤醒词')
      ?.run?.(args);

  expect(setWord('hello')).toEqual({
    ok: false,
    reply: '唤醒词要有中文，用法：/设置唤醒词 我想吃鱼了',
  });
  expect(setWord('小猫饿了')).toEqual({
    ok: true,
    reply: '已处理设置唤醒词请求',
  });
  expect(words.get()).toBe('小猫饿了');
  wakeWord.hear({ start: 0, end: 0, text: '我想吃鱼了' });
  wakeWord.hear({ start: 0, end: 0, text: '小猫饿啦' });
  expect(woken).toBe(1);
});
