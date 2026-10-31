import { fansLampTool } from '../../../src/app/tools/fans-lamp';
import { silentLog } from '../../support/fakes';

const context = { asker: '雅', question: '' };

test('sends the lamp in silence, whether it went or was already sent today', async () => {
  for (const result of ['sent', 'already'] as const) {
    const tool = fansLampTool(() => Promise.resolve({ result }), silentLog);
    const answer = await tool.call({}, context);
    expect(answer.silent).toBe(true);
    expect(JSON.parse(answer.text)).toEqual({ sent: true, result });
  }
});

test('is admin-only, /灯牌 takes nothing after it and says nothing', () => {
  const tool = fansLampTool(() => Promise.resolve({ result: 'sent' }), silentLog);
  expect(tool.adminOnly).toBe(true);
  const [command] = tool.commands!;
  expect(command!.name).toBe('灯牌');
  expect(command!.parse(' ')).toEqual({ args: {} });
  expect(command!.parse('3')).toHaveProperty('usage');
  expect(command!.say({ text: '{}' }, {})).toBe('');
});

test('a room-feed that fails is an error result', async () => {
  const tool = fansLampTool(() => Promise.reject(new Error('粉丝团面板里没找到送灯牌')), silentLog);
  expect(await tool.call({}, context)).toEqual({
    text: '现在点不了灯牌，请稍后再试',
    isError: true,
  });
});

test('too few diamonds: the bot says so itself, without the numbers, which go to the log', async () => {
  const logged: [string, object | undefined][] = [];
  const log = {
    ...silentLog,
    info: (message: string, meta?: object) => void logged.push([message, meta]),
  };
  const tool = fansLampTool(
    () => Promise.resolve({ result: 'notEnough' as const, diamonds: 1, price: 2 }),
    log,
  );
  expect(await tool.call({}, context)).toEqual({
    text: JSON.stringify({ sent: false }),
    silent: true,
    say: '钻石不够点灯牌',
  });
  expect(logged).toEqual([
    ['not enough diamonds for the fans lamp', { asker: '雅', diamonds: 1, price: 2 }],
  ]);
});
