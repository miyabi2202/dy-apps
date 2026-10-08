import type { Frame, FromWorker, ToWorker } from './core/protocol';

/** Where the simulation runs: a real worker, or something a test controls. */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  terminate(): void;
}

interface Options {
  /** Makes the worker; the default starts the real physics worker. */
  createWorker?: () => WorkerLike;
  /** Called with each frame as it arrives, before `stats` updates. */
  onFrame?: (frame: Frame) => void;
}

export interface PileStats {
  /** Icons in the world, moving or at rest. */
  total: number;
  moving: number;
  /** Asked for but not yet released. */
  queued: number;
}

const startWorker = (): WorkerLike =>
  new Worker(new URL('./pile-worker.ts', import.meta.url), { type: 'module' });

/**
 * The page's handle on the physics worker: sends it what the user asks for and takes in
 * the frames it posts. The worker runs between `start()` and `stop()`; commands sent while
 * it isn't ready are queued for it.
 */
export class PileClient {
  stats: PileStats = { total: 0, moving: 0, queued: 0 };
  /** Set if the worker failed, with its message; the canvas then stays empty. */
  error: string | null = null;

  private readonly createWorker: () => WorkerLike;
  private readonly onFrame: ((frame: Frame) => void) | undefined;
  private worker: WorkerLike | null = null;
  private ready = false;
  private readonly pending: ToWorker[] = [];

  constructor({ createWorker = startWorker, onFrame }: Options = {}) {
    this.createWorker = createWorker;
    this.onFrame = onFrame;
  }

  /** Start the worker, if it isn't running. */
  start(): void {
    if (this.worker) return;
    this.worker = this.createWorker();
    this.worker.onmessage = ({ data }) => this.receive(data);
  }

  /** Stop the worker; the pile is gone with it. */
  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  /** Icons in the world as of the latest frame: moving, resting or held. */
  alive(): number {
    return this.stats.total;
  }

  /** Drop `count` more icons in. */
  add(count: number): void {
    this.send({ type: 'add', count });
  }

  /** Destroy `count` icons, roughly from the top of the pile down, at once. */
  remove(count: number): void {
    this.send({ type: 'remove', count });
  }

  /**
   * Set `count` icons aside, roughly from the top of the pile down (or in a clump `near` a
   * fraction of the canvas's width), to carry away: the next frame's `scooped` says which.
   * Each stays put until `grab`bed, and is then held until `release`d or `destroy`ed.
   * `extra` of them are over the number to remove, for dropping back.
   */
  scoop(count: number, extra: number, near?: number): void {
    this.send(
      near === undefined ? { type: 'scoop', count, extra } : { type: 'scoop', count, extra, near },
    );
  }

  /** Empty the pile. */
  clear(): void {
    this.send({ type: 'clear' });
  }

  /** A new world of this size, in pixels; the pile is emptied with it. */
  resize(width: number, height: number): void {
    this.send({ type: 'resize', width, height });
  }

  /** Pick icon `id` up: it leaves the pile and the engine until let go. */
  grab(id: number): void {
    this.send({ type: 'grab', id });
  }

  /** Let held icon `id` go at (x, y) in pixels: it falls from there, moving at `vx`, `vy` px/s if given. */
  release(id: number, x: number, y: number, vx?: number, vy?: number): void {
    this.send(
      vx === undefined && vy === undefined
        ? { type: 'release', id, x, y }
        : { type: 'release', id, x, y, vx: vx ?? 0, vy: vy ?? 0 },
    );
  }

  /** Drop held icon `id` in the bin. */
  destroy(id: number): void {
    this.send({ type: 'destroy', id });
  }

  private send(message: ToWorker): void {
    if (this.ready && this.worker) this.worker.postMessage(message);
    else this.pending.push(message);
  }

  private receive(message: FromWorker): void {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        for (const queued of this.pending) this.worker?.postMessage(queued);
        this.pending.length = 0;
        break;
      case 'frame':
        this.onFrame?.(message.frame);
        this.stats = {
          total: message.frame.total,
          moving: message.frame.movingIds.length,
          queued: message.frame.queued,
        };
        break;
      case 'error':
        this.error = message.message;
        break;
    }
  }
}
