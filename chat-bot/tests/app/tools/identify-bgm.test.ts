import { identifyBgmTool } from '../../../src/app/tools/identify-bgm';
import { silentLog } from '../../support/fakes';

const context = { asker: '小红', question: '' };

test('answers the song playing, or that there is none', async () => {
  const found = identifyBgmTool(
    () => Promise.resolve({ title: '晴天', artist: '周杰伦' }),
    silentLog,
  );
  expect(JSON.parse((await found.call({}, context)).text)).toEqual({
    found: true,
    title: '晴天',
    artist: '周杰伦',
  });
  const none = identifyBgmTool(() => Promise.resolve(null), silentLog);
  expect(JSON.parse((await none.call({}, context)).text)).toEqual({ found: false });
});

test('an error is an error result Claude can pass on, and is logged', async () => {
  const warned: string[] = [];
  const broken = identifyBgmTool(() => Promise.reject(new Error('worker is gone')), {
    ...silentLog,
    warn: (message) => void warned.push(message),
  });
  expect(await broken.call({}, context)).toEqual({
    text: '现在识别不了背景音乐，请稍后再试',
    isError: true,
  });
  expect(warned).toEqual(['could not identify the music']);
});

test('/识别背景音乐 says what is playing, or that nothing was found', async () => {
  const say = async (match: { title: string; artist: string } | null) => {
    const tool = identifyBgmTool(() => Promise.resolve(match), silentLog);
    const [command] = tool.commands!;
    expect(command!.name).toBe('识别背景音乐');
    expect(command!.parse('')).toEqual({ args: {} });
    return command!.say(await tool.call({}, context), {});
  };
  expect(await say({ title: 'Aimaimoko', artist: 'Inori Minase' })).toBe(
    '现在放的是Inori Minase的《Aimaimoko》',
  );
  expect(await say({ title: 'Aimaimoko', artist: '' })).toBe('现在放的是《Aimaimoko》');
  expect(await say(null)).toBe('我找不到');
});
