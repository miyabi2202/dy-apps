import { heartTool } from '../../src/mcp/heart';
import { silentLog } from '../support/fakes';

const context = { asker: '雅', question: '' };

test('sends one heart in silence and says how many diamonds are left', async () => {
  let sent = 0;
  const tool = heartTool(
    () => Promise.resolve({ result: 'sent' as const, diamondsLeft: 10 - ++sent }),
    silentLog,
  );
  const answer = await tool.call({}, context);
  expect(sent).toBe(1);
  expect(answer.silent).toBe(true);
  expect(JSON.parse(answer.text)).toEqual({ sent: true, diamondsLeft: 9 });
});

test('is admin-only, /小心心 takes nothing after it and says nothing', () => {
  const tool = heartTool(() => Promise.resolve({ result: 'sent', diamondsLeft: null }), silentLog);
  expect(tool.adminOnly).toBe(true);
  const [command] = tool.commands!;
  expect(command!.name).toBe('小心心');
  expect(command!.parse(' ')).toEqual({ args: {} });
  expect(command!.parse('3')).toHaveProperty('usage');
  expect(command!.say({ text: '{}' }, {})).toBe('');
});

test('a room-feed that fails is an error result', async () => {
  const tool = heartTool(() => Promise.reject(new Error('页面上没找到小心心')), silentLog);
  expect(await tool.call({}, context)).toEqual({
    text: '现在送不了小心心，请稍后再试',
    isError: true,
  });
});

test('too few diamonds: the bot says so itself, without the numbers, which go to the log', async () => {
  const logged: [string, object | undefined][] = [];
  const log = {
    ...silentLog,
    info: (message: string, meta?: object) => void logged.push([message, meta]),
  };
  const tool = heartTool(
    () => Promise.resolve({ result: 'notEnough' as const, diamonds: 0, price: 1 }),
    log,
  );
  expect(await tool.call({}, context)).toEqual({
    text: JSON.stringify({ sent: false }),
    silent: true,
    say: '钻石不够送小心心',
  });
  expect(logged).toEqual([
    ['not enough diamonds for a heart', { asker: '雅', diamonds: 0, price: 1 }],
  ]);
});
