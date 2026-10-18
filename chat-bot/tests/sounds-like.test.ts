import { soundsLike, syllables } from '../src/core/sounds-like';

const FISH = syllables('我想吃鱼了');

test.each([
  ['好饿，我想吃鱼了。', true],
  ['我想吃余了', true], // a homophone
  ['我想吃 于了', true],
  ['窝想次鱼了', true], // two sounds people mix up
  ['我想吃鱼啦', true], // one near syllable
  ['我想吃驴了', true],
  ['我想吃饭了', false], // another word
  ['我想吃肉了', false],
  ['我想鱼了', false],
  ['我熊吃鱼啦', false], // two near syllables
  ['今天天气真好', false],
])('%s → %s', (text, wakes) => {
  expect(soundsLike(text, FISH)).toBe(wakes);
});

test('a short phrase has to sound the same, and an empty one never matches', () => {
  expect(soundsLike('小默在吗', syllables('小默'))).toBe(true);
  expect(soundsLike('小魔在吗', syllables('小默'))).toBe(true);
  expect(soundsLike('小猫在吗', syllables('小默'))).toBe(false);
  expect(soundsLike('我想吃鱼了', [])).toBe(false);
});
