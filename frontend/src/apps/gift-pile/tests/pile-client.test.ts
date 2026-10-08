import type { FromWorker, ToWorker } from '../core/protocol';
import { PileClient, type WorkerLike } from '../pile-client';
import { frame } from './helpers';

/** A worker the test drives: records what it is sent, and can post back. */
class FakeWorker implements WorkerLike {
  readonly sent: ToWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  postMessage(message: ToWorker) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  /** The worker says something. */
  post(message: FromWorker) {
    this.onmessage?.({ data: message } as MessageEvent<FromWorker>);
  }
}

describe('PileClient', () => {
  it('holds commands until the worker is ready, then sends them in order', () => {
    const workers: FakeWorker[] = [];
    const client = new PileClient({
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    client.add(5);
    expect(workers).toHaveLength(0);

    client.start();
    client.resize(300, 400);
    const [worker] = workers;
    expect(worker!.sent).toEqual([]);

    worker!.post({ type: 'ready' });
    expect(worker!.sent).toEqual([
      { type: 'add', count: 5 },
      { type: 'resize', width: 300, height: 400 },
    ]);
    client.grab(3);
    expect(worker!.sent.at(-1)).toEqual({ type: 'grab', id: 3 });
    client.setDropLine(-250);
    expect(worker!.sent.at(-1)).toEqual({ type: 'setDropLine', y: -250 });
  });

  it('takes stats from frames and hands each frame on', () => {
    const worker = new FakeWorker();
    const frames: number[] = [];
    const client = new PileClient({
      createWorker: () => worker,
      onFrame: (f) => frames.push(f.total),
    });
    client.start();
    worker.post({ type: 'ready' });
    worker.post({
      type: 'frame',
      frame: frame({
        total: 12,
        queued: 3,
        moving: [
          [0, 1, 1],
          [1, 2, 2],
        ],
      }),
    });
    expect(client.stats).toEqual({ total: 12, moving: 2, queued: 3 });
    expect(frames).toEqual([12]);

    worker.post({ type: 'error', message: 'no wasm' });
    expect(client.error).toBe('no wasm');
  });

  it('stops the worker and starts a fresh one that waits for ready again', () => {
    const workers: FakeWorker[] = [];
    const client = new PileClient({
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    client.start();
    workers[0]!.post({ type: 'ready' });
    client.stop();
    expect(workers[0]!.terminated).toBe(true);

    client.start();
    client.clear();
    expect(workers).toHaveLength(2);
    expect(workers[1]!.sent).toEqual([]);
    workers[1]!.post({ type: 'ready' });
    expect(workers[1]!.sent).toEqual([{ type: 'clear' }]);
  });
});
