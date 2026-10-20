import { Pending } from '../src/app/pending';

test('idle resolves once all work has ended, including what was started meanwhile, and failed work too', async () => {
  const work = new Pending();
  const finished: string[] = [];
  let first: () => void = () => {};
  work.track(
    new Promise<void>((resolve) => (first = resolve)).then(() => void finished.push('一')),
  );
  work.track(Promise.reject(new Error('boom')));

  const idle = work.idle();
  // Started while waiting: idle waits for it too.
  first();
  work.track(Promise.resolve().then(() => void finished.push('二')));
  await idle;

  expect(finished).toEqual(['一', '二']);
  await work.idle();
});
