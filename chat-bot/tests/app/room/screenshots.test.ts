import { Screenshots } from '../../../src/app/room/screenshots';
import { fakeSettings } from '../../support/fake-settings';
import { silentLog } from '../../support/fakes';

test('screenshots go to Claude only while on', async () => {
  const frame = new Uint8Array([0xff, 0xd8]);
  let taken = 0;
  const settings = fakeSettings({ screenshots: false });
  const screenshots = new Screenshots({
    fetch: () => {
      taken++;
      return Promise.resolve(frame);
    },
    settings,
    log: silentLog,
  });
  expect(await screenshots.take()).toBeUndefined();
  settings.set({ screenshots: true });
  expect(await screenshots.take()).toBe(frame);
  settings.set({ screenshots: false });
  expect(await screenshots.take()).toBeUndefined();
  // room-feed isn't even asked while screenshots are off, unless a puzzle always wants one.
  expect(taken).toBe(1);
  expect(await screenshots.take(true)).toBe(frame);
});

test('a screenshot that fails is no picture, and prompting goes on', async () => {
  const warned: string[] = [];
  const screenshots = new Screenshots({
    fetch: () => Promise.reject(new Error('房间未连接')),
    settings: fakeSettings({ screenshots: true }),
    log: { ...silentLog, warn: (message) => void warned.push(message) },
  });
  expect(await screenshots.take()).toBeUndefined();
  expect(warned).toEqual(['no screenshot']);
});

test('without a way to get one there is never a picture', async () => {
  const screenshots = new Screenshots({
    settings: fakeSettings({ screenshots: true }),
    log: silentLog,
  });
  expect(await screenshots.take(true)).toBeUndefined();
});
