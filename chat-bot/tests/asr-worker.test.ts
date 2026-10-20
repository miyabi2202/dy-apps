import { connectWorker, type OpenSocket, type WorkerSocket } from '../src/adapters/asr-worker';

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

const noSleep = () => Promise.resolve();

test('connects to the service that is running, without starting one, and passes the lines both ways', async () => {
  const fake = fakeSocket();
  const lines: string[] = [];
  let started = 0;
  const spawnWorker = connectWorker({
    port: 8758,
    start: () => void started++,
    connect: () => Promise.resolve(fake.socket),
    sleep: noSleep,
  });
  const worker = spawnWorker({ onLine: (line) => void lines.push(line), onLog: () => {} });
  await Promise.resolve();
  await Promise.resolve();
  fake.receive('{"ready": true}');
  worker.send('{"url": "u"}');

  expect(lines).toEqual(['{"ready": true}']);
  expect(fake.written).toEqual(['{"url": "u"}']);
  expect(started).toBe(0);
  // The service closing the connection is the worker exiting.
  fake.drop();
  await expect(worker.exited).resolves.toBeNull();
});

test('starts the service once when nothing is listening, and connects when it comes up', async () => {
  const fake = fakeSocket();
  let refused = 3;
  let started = 0;
  const logs: string[] = [];
  const connect: OpenSocket = () =>
    refused-- > 0 ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(fake.socket);
  const worker = connectWorker({
    port: 8758,
    start: () => void started++,
    connect,
    sleep: noSleep,
  })({ onLine: () => {}, onLog: (line) => void logs.push(line) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  worker.send('{"url": "u"}');

  expect(started).toBe(1);
  expect(logs).toEqual(['no speech service on port 8758, starting one']);
  expect(fake.written).toEqual(['{"url": "u"}']);
  worker.kill();
  await worker.exited;
});

test('kill only disconnects, and a new worker connects again to the same service', async () => {
  const [one, two] = [fakeSocket(), fakeSocket()];
  const sockets = [one, two];
  let started = 0;
  const spawnWorker = connectWorker({
    port: 8758,
    start: () => void started++,
    connect: () => Promise.resolve(sockets.shift()!.socket),
    sleep: noSleep,
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
  expect(started).toBe(0);
  second.kill();
  await second.exited;
});

test('gives up, saying so, when the service never comes up', async () => {
  const worker = connectWorker({
    port: 8758,
    start: () => {},
    connect: () => Promise.reject(new Error('ECONNREFUSED')),
    maxTries: 3,
    sleep: noSleep,
  })({ onLine: () => {}, onLog: () => {} });
  await expect(worker.exited).rejects.toThrow('the speech service did not come up');
});

test('a worker killed before it connected never connects', async () => {
  const fake = fakeSocket();
  const worker = connectWorker({
    port: 8758,
    start: () => {},
    connect: () => Promise.resolve(fake.socket),
    sleep: noSleep,
  })({ onLine: () => {}, onLog: () => {} });
  worker.kill();
  await expect(worker.exited).resolves.toBeNull();
  worker.send('{"url": "u"}');
  expect(fake.written).toEqual([]);
});
