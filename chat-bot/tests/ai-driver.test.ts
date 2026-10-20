import { AiDriver, concurrencyCommand } from '../src/app/ai-driver';
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

test('/并发数 changes how many run at once, starting what waits when raised', async () => {
  const driver = new AiDriver({ name: 'claude', concurrency: 1, log: silentLog });
  const other = { concurrency: 1 };
  const command = concurrencyCommand([driver, other], silentLog);
  let started = 0;
  for (let i = 0; i < 3; i++) void driver.run(() => new Promise(() => void started++));
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
  expect(started).toBe(1);

  expect(command.run?.('3')).toEqual({ ok: true, reply: '已处理并发数请求' });
  await tick();
  expect(started).toBe(3);
  expect(other.concurrency).toBe(3);
  expect(command.run?.('20')).toEqual({
    ok: false,
    reply: '并发数要写成 1 到 5 的整数，用法：/并发数 2',
  });
});
