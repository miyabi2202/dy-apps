import { setThanksThresholdTool } from '../../src/mcp/set-thanks-threshold';

const context = { asker: '雅', question: '以后 100 钻以下的礼物不用谢了', admin: true };

test('sets the threshold, admin-only, and says what it was and is', async () => {
  const thanker = { threshold: 99999 };
  const tool = setThanksThresholdTool(thanker);
  expect(tool.adminOnly).toBe(true);
  expect(JSON.parse((await tool.call({ diamonds: 100 }, context)).text)).toEqual({
    before: 99999,
    after: 100,
    on: true,
  });
  expect(thanker.threshold).toBe(100);
  expect(JSON.parse((await tool.call({ diamonds: 99999 }, context)).text)).toMatchObject({
    on: false,
  });
});

test('anything but a whole number of diamonds is an error, and changes nothing', async () => {
  const thanker = { threshold: 100 };
  const tool = setThanksThresholdTool(thanker);
  for (const diamonds of ['100', -1, 1.5, undefined]) {
    expect(await tool.call({ diamonds }, context)).toMatchObject({ isError: true });
  }
  expect(thanker.threshold).toBe(100);
});
