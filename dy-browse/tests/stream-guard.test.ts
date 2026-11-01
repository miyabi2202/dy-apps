import { createServer } from 'node:net';
import { isPortListening } from '../src/adapters/port-check';
import { StreamGuard } from '../src/app/stream-guard';
import { StreamRunningError, StreamStartedError } from '../src/core/errors';

function guardWith(listening: Set<number>) {
  const asked: number[] = [];
  const guard = new StreamGuard((port) => {
    asked.push(port);
    return Promise.resolve(listening.has(port));
  });
  return { guard, asked };
}

describe('StreamGuard', () => {
  it('lets a run start when neither port listens, having asked about 8757 and 8758', async () => {
    const { guard, asked } = guardWith(new Set());
    await expect(guard.assertNoStream()).resolves.toBeUndefined();
    expect(asked).toEqual([8757, 8758]);
  });

  it.each([8757, 8758])('refuses to start when port %i listens', async (port) => {
    const { guard } = guardWith(new Set([port]));
    await expect(guard.assertNoStream()).rejects.toBeInstanceOf(StreamRunningError);
    await expect(guard.assertNoStream()).rejects.toThrow(String(port));
  });

  it('says a stream started when a port begins listening during the run', async () => {
    const listening = new Set<number>();
    const { guard } = guardWith(listening);
    await guard.assertStillQuiet();
    listening.add(8758);
    await expect(guard.assertStillQuiet()).rejects.toBeInstanceOf(StreamStartedError);
  });
});

describe('isPortListening', () => {
  it('sees a local server, and sees it gone', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    expect(await isPortListening(port)).toBe(true);
    await new Promise((resolve) => server.close(resolve));
    expect(await isPortListening(port)).toBe(false);
  });
});
