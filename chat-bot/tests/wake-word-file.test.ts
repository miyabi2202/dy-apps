import { wakeWordFile } from '../src/adapters/wake-word-file';
import type { Log } from '../src/app/ports';

test("uses the room's own wake word, else the default, and picks up edits", () => {
  const warnings: string[] = [];
  const log: Log = { debug() {}, info() {}, warn: (message) => warnings.push(message), error() {} };
  let file = '{"default": "我想吃鱼了"}';
  const words = wakeWordFile('wake-words.json', '123', {
    log,
    read: () => file,
    write: (_, text) => (file = text),
  });
  expect(words.get()).toBe('我想吃鱼了');

  file = '{"default": "我想吃鱼了", "123": "小猫饿了", "456": "开饭"}';
  expect(words.get()).toBe('小猫饿了');

  file = '{"default": ';
  expect(words.get()).toBe('小猫饿了');
  expect(warnings).toEqual(['could not read the wake words, keeping the last ones']);

  file = '{}';
  expect(words.get()).toBe('');
});

test("setting it writes only this room's, keeping the rest", () => {
  let file = '{"default": "我想吃鱼了", "456": "开饭"}';
  const words = wakeWordFile('wake-words.json', '123', {
    log: { debug() {}, info() {}, warn() {}, error() {} },
    read: () => file,
    write: (_, text) => (file = text),
  });
  words.set('小猫饿了');
  expect(JSON.parse(file)).toEqual({ default: '我想吃鱼了', 456: '开饭', 123: '小猫饿了' });
  expect(words.get()).toBe('小猫饿了');
});
