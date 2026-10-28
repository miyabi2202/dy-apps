import { pressLikeTool } from '../../src/mcp/press-like';
import { silentLog } from '../support/fakes';

const context = { asker: '雅', question: '' };

/** A room-feed that gives the likes asked, unless Douyin's 手速太快了 stops it at `cut`. */
function setup(cut = Infinity) {
  const asked: number[] = [];
  const tool = pressLikeTool((likes) => {
    asked.push(likes);
    const liked = Math.min(likes, cut);
    return Promise.resolve({ liked, heldMs: liked * 200, tooFast: liked < likes });
  }, silentLog);
  return { tool, asked };
}

test('asks room-feed for the likes, 100 unless told, and says how many it gave', async () => {
  const { tool, asked } = setup();
  const result = await tool.call({ likes: 40 }, context);
  // Silent: the bot sends nothing back, and Claude is told the program has answered.
  expect(result.silent).toBe(true);
  expect(JSON.parse(result.text)).toEqual({
    sent: true,
    asked: 40,
    liked: 40,
    stoppedByTooFast: false,
  });
  await tool.call({}, context);
  expect(asked).toEqual([40, 100]);
});

test('says how many it gave when 手速太快了 stopped it early', async () => {
  const { tool } = setup(30);
  expect(JSON.parse((await tool.call({ likes: 100 }, context)).text)).toEqual({
    sent: true,
    asked: 100,
    liked: 30,
    stoppedByTooFast: true,
  });
});

test('/点赞 takes a whole number of likes up to 200, or none for 100, and says nothing', () => {
  const [command] = setup().tool.commands!;
  expect(command!.name).toBe('点赞');
  expect(command!.parse('')).toEqual({ args: { likes: 100 } });
  expect(command!.parse(' 200 ')).toEqual({ args: { likes: 200 } });
  for (const bad of ['0', '201', '2.5', '很多']) {
    expect(command!.parse(bad)).toHaveProperty('usage');
  }
  expect(command!.say({ text: '{}' }, {})).toBe('');
});

test('likes out of range, or a room-feed that fails, are error results', async () => {
  const { tool, asked } = setup();
  expect(await tool.call({ likes: 5000 }, context)).toMatchObject({ isError: true });
  expect(asked).toEqual([]);
  const broken = pressLikeTool(
    () => Promise.reject(new Error('直播间的弹幕连接还没建立')),
    silentLog,
  );
  expect(await broken.call({ likes: 20 }, context)).toEqual({
    text: '现在点不了赞，请稍后再试',
    isError: true,
  });
});
