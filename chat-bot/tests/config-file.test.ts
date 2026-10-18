import { liveAdmins, readConfig } from '../src/adapters/config-file';
import type { Log } from '../src/app/ports';

const fromText = (text: string) => () => text;

test('reads admins and the persona, and rejects admins that are not user ids', () => {
  expect(readConfig('config.json', fromText('{"admins": ["123"], "persona": "小猫"}'))).toEqual({
    admins: ['123'],
    persona: '小猫',
  });
  expect(readConfig('config.json', fromText('{}'))).toEqual({ admins: [], persona: '' });
  expect(() => readConfig('config.json', fromText('{"admins": ["雅"]}'))).toThrow(
    'admins must be a list of user ids',
  );
});

test('picks up admins added or removed while running, and keeps them through a broken edit', () => {
  const warnings: string[] = [];
  const log: Log = { debug() {}, info() {}, warn: (message) => warnings.push(message), error() {} };
  let file = '{"admins": ["1"]}';
  const admins = liveAdmins('config.json', { log, read: () => file });
  expect(admins.has('1')).toBe(true);

  file = '{"admins": ["2"]}';
  expect(admins.has('1')).toBe(false);
  expect(admins.has('2')).toBe(true);

  file = '{"admins": ["2", ';
  expect(admins.has('2')).toBe(true);
  expect(admins.has('2')).toBe(true);
  expect(warnings).toEqual(['could not read the admins, keeping the last ones']);
});

test('listing 111111 makes every 私密 room viewer an admin', () => {
  const log: Log = { debug() {}, info() {}, warn() {}, error() {} };
  let file = '{"admins": ["111111"]}';
  const admins = liveAdmins('config.json', { log, read: () => file });
  expect(admins.has('111111-雅***-31')).toBe(true);
  expect(admins.has('7664182420958889017')).toBe(false);

  file = '{"admins": []}';
  expect(admins.has('111111-雅***-31')).toBe(false);
});
