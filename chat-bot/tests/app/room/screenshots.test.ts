import { Screenshots } from '../../../src/app/room/screenshots';
import { silentLog } from '../../support/fakes';

test('a screenshot that fails is no picture, and the tool goes on', async () => {
  const warned: string[] = [];
  const screenshots = new Screenshots({
    fetch: () => Promise.reject(new Error('房间未连接')),
    log: { ...silentLog, warn: (message) => void warned.push(message) },
  });
  expect(await screenshots.take()).toBeUndefined();
  expect(warned).toEqual(['no screenshot']);
});
