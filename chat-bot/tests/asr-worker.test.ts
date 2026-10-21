import { connectWorker, type WorkerSocket } from '../src/adapters/asr-worker';

/** A socket the test feeds lines to and closes by hand. */
function fakeSocket() {
  const written: string[] = [];
  const closes = { count: 0 };
  let lineHandler: (line: string) => void = () => {};
  let closeHandler: () => void = () => {};
  const socket: WorkerSocket = {
    write: (line) => void written.push(line),
    close: () => {
      closes.count++;
      closeHandler();
    },
    onLine: (handler) => (lineHandler = handler),
    onClose: (handler) => (closeHandler = handler),
  };
  return {
    socket,
    written,
    closes,
    receive: (line: string) => lineHandler(line),
    drop: () => closeHandler(),
  };
}

test('connects to the service that is running and passes the lines both ways', async () => {
  const fake = fakeSocket();
  const lines: string[] = [];
  const spawnWorker = connectWorker({ port: 8758, connect: () => Promise.resolve(fake.socket) });
  const worker = spawnWorker({ onLine: (line) => void lines.push(line), onLog: () => {} });
  await Promise.resolve();
  await Promise.resolve();
  fake.receive('{"ready": true}');
  worker.send('{"url": "u"}');

  expect(lines).toEqual(['{"ready": true}']);
  expect(fake.written).toEqual(['{"url": "u"}']);
  // The service closing the connection is the worker exiting.
  fake.drop();
  await expect(worker.exited).resolves.toBeNull();
});

test('with no service running, says at once how to start it, and starts none', async () => {
  const worker = connectWorker({
    port: 8758,
    connect: () => Promise.reject(new Error('ECONNREFUSED')),
  })({ onLine: () => {}, onLog: () => {} });
  await expect(worker.exited).rejects.toThrow(
    'no speech service on port 8758: start it first, with uv run --directory chat-bot/asr chat-bot/asr/transcribe.py --serve 8758',
  );
});

test('kill only disconnects, and a new worker connects again to the same service', async () => {
  const [one, two] = [fakeSocket(), fakeSocket()];
  const sockets = [one, two];
  const spawnWorker = connectWorker({
    port: 8758,
    connect: () => Promise.resolve(sockets.shift()!.socket),
  });
  const first = spawnWorker({ onLine: () => {}, onLog: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  first.kill();
  await first.exited;
  expect(one.closes.count).toBe(1);
  expect(two.closes.count).toBe(0);

  const second = spawnWorker({ onLine: () => {}, onLog: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  second.send('{"url": "v"}');
  expect(two.written).toEqual(['{"url": "v"}']);
  second.kill();
  await second.exited;
});

test('a worker killed before it connected never connects', async () => {
  const fake = fakeSocket();
  const worker = connectWorker({
    port: 8758,
    connect: () => Promise.resolve(fake.socket),
  })({ onLine: () => {}, onLog: () => {} });
  worker.kill();
  await expect(worker.exited).resolves.toBeNull();
  worker.send('{"url": "u"}');
  expect(fake.written).toEqual([]);
});
