import { readConfig } from '../src/adapters/config-file';

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
