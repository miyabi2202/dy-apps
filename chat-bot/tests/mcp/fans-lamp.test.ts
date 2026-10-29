import { fansLampTool } from '../../src/mcp/fans-lamp';
import { silentLog } from '../support/fakes';

const context = { asker: '雅', question: '' };

test('sends the lamp in silence, whether it went or was already sent today', async () => {
  for (const result of ['sent', 'already'] as const) {
    const tool = fansLampTool(() => Promise.resolve(result), silentLog);
    const answer = await tool.call({}, context);
    expect(answer.silent).toBe(true);
    expect(JSON.parse(answer.text)).toEqual({ sent: true, result });
  }
});

test('is admin-only, /灯牌 takes nothing after it and says nothing', () => {
  const tool = fansLampTool(() => Promise.resolve('sent'), silentLog);
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
