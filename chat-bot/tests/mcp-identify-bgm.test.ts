import { identifyBgmTool } from '../src/mcp/identify-bgm';
import { silentLog } from './fakes';

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
  expect(await broken.call({}, context)).toEqual({ text: '现在识别不了背景音乐', isError: true });
  expect(warned).toEqual(['could not identify the music']);
});
