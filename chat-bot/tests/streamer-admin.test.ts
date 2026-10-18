import { StreamerAdmin } from '../src/app/streamer-admin';

const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('the streamer is an admin once found, besides the admins from config.json', async () => {
  const answers = [null, { uid: '4431457071932131', nickname: '海老夏二🎂' }];
  const later: (() => void)[] = [];
  const admins = new StreamerAdmin({
    admins: { has: (id) => id === '7664182420958889017' },
    find: () => Promise.resolve(answers.shift() ?? null),
    log,
    schedule: (run) => later.push(run),
  });
  admins.start();
  await flush();
  expect(admins.has('4431457071932131')).toBe(false);
  expect(admins.has('7664182420958889017')).toBe(true);

  later.shift()!();
  await flush();
  expect(admins.has('4431457071932131')).toBe(true);
  expect(admins.has('7664182420958889017')).toBe(true);
  expect(admins.has('111111')).toBe(false);
  expect(later).toHaveLength(0);
});
