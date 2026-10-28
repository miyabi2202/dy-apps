import { pressLikeTool } from '../../src/mcp/press-like';
import { silentLog } from '../support/fakes';

const context = { asker: '雅', question: '' };

/** A like that holds the key as long as asked, unless Douyin cuts it at `cutMs`. */
function setup(cutMs = Infinity) {
  const held: number[] = [];
  const tool = pressLikeTool((seconds) => {
    held.push(seconds);
    const heldMs = Math.min(seconds * 1000, cutMs);
    return Promise.resolve({ heldMs, tooFast: heldMs < seconds * 1000 });
  }, silentLog);
  return { tool, held };
}

test('holds the key a second for every 20 likes, 100 likes unless told, and says how many it gave', async () => {
  const { tool, held } = setup();
  expect(JSON.parse((await tool.call({ likes: 40 }, context)).text)).toEqual({
    asked: 40,
    liked: 40,
    stoppedByTooFast: false,
  });
  await tool.call({}, context);
  expect(held).toEqual([2, 5]);
});

test('says how many it gave when 手速太快了 stopped it early', async () => {
  const { tool } = setup(1500);
  expect(JSON.parse((await tool.call({ likes: 100 }, context)).text)).toEqual({
    asked: 100,
    liked: 30,
    stoppedByTooFast: true,
  });
});

test('/点赞 takes a whole number of likes up to 1200, or none for 100, and says nothing', () => {
  const [command] = setup().tool.commands!;
  expect(command!.name).toBe('点赞');
  expect(command!.parse('')).toEqual({ args: { likes: 100 } });
  expect(command!.parse(' 300 ')).toEqual({ args: { likes: 300 } });
  for (const bad of ['0', '1201', '2.5', '很多']) {
    expect(command!.parse(bad)).toHaveProperty('usage');
  }
  expect(command!.say({ text: '{}' }, {})).toBe('');
});

test('likes out of range, or a room-feed that fails, are error results', async () => {
  const { tool, held } = setup();
  expect(await tool.call({ likes: 5000 }, context)).toMatchObject({ isError: true });
  expect(held).toEqual([]);
  const broken = pressLikeTool(
    () => Promise.reject(new Error('直播间的弹幕连接还没建立')),
    silentLog,
  );
  expect(await broken.call({ likes: 20 }, context)).toEqual({
    text: '现在点不了赞，请稍后再试',
    isError: true,
  });
});
