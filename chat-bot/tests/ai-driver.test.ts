import { AiDriver } from '../src/app/ai-driver';
import { silentLog } from './fakes';

test('runs up to `concurrency` at once, starting what waits in order as slots free up', async () => {
  const driver = new AiDriver({ name: 'claude', concurrency: 3, log: silentLog });
  const started: string[] = [];
  const finish = new Map<string, (answer: string) => void>();
  const ask = driver.wrap(
    ({ prompt }) =>
      new Promise((resolve) => {
        started.push(prompt);
        finish.set(prompt, resolve);
      }),
  );
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const answers = ['甲', '乙', '丙', '丁', '戊'].map((prompt) => ask({ prompt }));
  await tick();
  expect(started).toEqual(['甲', '乙', '丙']);

  finish.get('乙')?.('二');
  await tick();
  expect(started).toEqual(['甲', '乙', '丙', '丁']);

  for (const prompt of ['甲', '丙', '丁']) finish.get(prompt)?.(prompt);
  await tick();
  finish.get('戊')?.('五');
  expect(await Promise.all(answers)).toEqual(['甲', '二', '丙', '丁', '五']);
});

test('a failed call frees its slot, and its caller gets the error', async () => {
  const driver = new AiDriver({ name: 'codex', concurrency: 1, log: silentLog });
  const failing = driver.run(() => Promise.reject(new Error('codex timed out')));
  const next = driver.run(() => Promise.resolve('好'));

  await expect(failing).rejects.toThrow('codex timed out');
  await expect(next).resolves.toBe('好');
});
