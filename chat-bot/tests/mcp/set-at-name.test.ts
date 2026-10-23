import { ChatHistory } from '../../src/core/chat/chat-history';
import { setAtNameTool } from '../../src/mcp/set-at-name';
import { fakeRoom } from '../support/fake-room';
import { silentLog } from '../support/fakes';

const AFU = '⊹꙳𝝑阿拂（吃荷灵咪馊饭版）𝝔⋆₊';

/** The tool in a room where 阿拂, 阿明 and 小红 chatted lately, its atNames kept in `names`. */
function setup(names: Record<string, string> = {}) {
  const history = new ChatHistory(100);
  history.add({ ts: 1, userId: '103094206072', nickname: AFU, content: '你可以只喊我阿拂吗' });
  history.add({ ts: 2, userId: 'u-阿明', nickname: '阿明', content: '晚上好' });
  history.add({ ts: 3, userId: 'u-阿明明', nickname: '阿明明', content: '我也来了' });
  history.add({ ts: 4, userId: '111111-苦***-31', nickname: '苦***', content: '叫我苦苦' });
  const store = { names };
  const tool = setAtNameTool({
    atNames: { get: () => store.names, set: (next) => (store.names = next) },
    room: fakeRoom({ history, atTrimStart: () => ['⊹꙳𝝑'] }),
    log: silentLog,
  });
  return { tool, store };
}

test('anyone sets what they are @ed as, and an empty name goes back to the nickname', async () => {
  const { tool, store } = setup({ 'u-阿明': '明哥' });
  expect(tool.adminOnly).toBeUndefined();
  const asked = { asker: AFU, userId: '103094206072', question: '只喊我阿拂' };
  const result = await tool.call({ name: ' @阿拂 ' }, asked);
  expect(JSON.parse(result.text)).toEqual({
    who: AFU,
    before: '',
    after: '阿拂',
    message: '好，以后 @阿拂',
  });
  expect(store.names).toEqual({ 'u-阿明': '明哥', '103094206072': '阿拂' });

  expect(JSON.parse((await tool.call({ name: '' }, asked)).text)).toMatchObject({
    before: '阿拂',
    after: '',
    message: '好，以后按昵称 @',
  });
  expect(store.names).toEqual({ 'u-阿明': '明哥' });
});

test("only an admin changes someone else's, found by nickname, without the 单推符号, or by part of it", async () => {
  const { tool, store } = setup();
  const viewer = { asker: '阿明', userId: 'u-阿明', question: '叫她小拂' };
  expect(await tool.call({ name: '小拂', who: '阿拂（吃荷灵咪馊饭版）𝝔⋆₊' }, viewer)).toEqual({
    text: '只有主播和管理员能改别人的称呼',
    isError: true,
  });
  // Naming themselves is fine.
  expect(await tool.call({ name: '明哥', who: '阿明' }, viewer)).not.toHaveProperty('isError');

  const admin = { asker: '雅', userId: '7001', question: '把阿拂叫成小拂', admin: true };
  expect(JSON.parse((await tool.call({ name: '小拂', who: '吃荷灵' }, admin)).text)).toMatchObject({
    who: AFU,
    after: '小拂',
  });
  expect(store.names).toEqual({ 'u-阿明': '明哥', '103094206072': '小拂' });
});

test('an admin naming someone no one, or more than one, matches changes nothing and says so', async () => {
  const { tool, store } = setup();
  const admin = { asker: '雅', userId: '7001', question: '', admin: true };
  expect(await tool.call({ name: 'x', who: '老王' }, admin)).toEqual({
    text: '最近的弹幕里没找到「老王」',
    isError: true,
  });
  // 阿明 is exactly one of them; 明 is in both.
  expect(await tool.call({ name: 'x', who: '明' }, admin)).toEqual({
    text: '「明」对上了好几个人：阿明、阿明明，问清楚是哪一个',
    isError: true,
  });
  expect(store.names).toEqual({});
  await tool.call({ name: '明哥', who: '阿明' }, admin);
  expect(store.names).toEqual({ 'u-阿明': '明哥' });
});

test('works in a 私密 room, keyed by the made-up id', async () => {
  const { tool, store } = setup();
  await tool.call({ name: '苦苦' }, { asker: '苦***', userId: '111111-苦***-31', question: '' });
  expect(store.names).toEqual({ '111111-苦***-31': '苦苦' });
});

test('a name too long, not a string, or an asker with no user id changes nothing', async () => {
  const { tool, store } = setup();
  const asked = { asker: '阿明', userId: 'u-阿明', question: '' };
  expect(await tool.call({ name: '一二三四五六七八九十一二三' }, asked)).toMatchObject({
    isError: true,
  });
  expect(await tool.call({ name: 3 }, asked)).toMatchObject({ isError: true });
  expect(await tool.call({ name: '阿明' }, { asker: '阿明', question: '' })).toMatchObject({
    isError: true,
  });
  expect(store.names).toEqual({});
});

test('/叫我 takes the rest as the name, empty for the nickname, and says the message', () => {
  const [command] = setup().tool.commands!;
  expect(command!.name).toBe('叫我');
  expect(command!.parse('阿拂')).toEqual({ args: { name: '阿拂' } });
  expect(command!.parse('')).toEqual({ args: { name: '' } });
  expect(command!.say({ text: JSON.stringify({ message: '好，以后 @阿拂' }) }, {})).toBe(
    '好，以后 @阿拂',
  );
});

test('listens, with no trigger, for being asked to @ someone by another name, said to the bot only', () => {
  const { listen } = setup().tool;
  expect(listen?.when).toContain('要是在跟机器人说才算');
  expect(listen?.trigger).toBeUndefined();
});
