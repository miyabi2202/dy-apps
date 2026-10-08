import RAPIER from '@dimforge/rapier2d-compat';
import { PILE } from './core/config';
import { PileEngine } from './core/engine';
import { frameBuffers, frameOf } from './core/frame';
import type { FromWorker, Scoop, ToWorker } from './core/protocol';

/** The part of the worker's global scope this file uses (the DOM lib types `self` as a Window). */
interface WorkerScope {
  postMessage(message: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}

/** A tick that falls this far behind drops the rest, rather than playing it back in a burst. */
const MAX_STEPS_PER_TICK = 4;

const scope = self as unknown as WorkerScope;
const stepMs = 1000 / PILE.stepHz;

/**
 * The physics thread: Rapier and the pile engine live here. Every `stepMs`, step the engine
 * as many times as the clock calls for and post what changed. The page never waits on the
 * simulation and the simulation never waits on drawing.
 */
async function main() {
  await RAPIER.init();
  const engine = new PileEngine({ rapier: RAPIER });
  // What has been scooped since the last frame, to go out with the next one.
  let scooped: Scoop[] = [];

  scope.onmessage = ({ data }) => {
    switch (data.type) {
      case 'add':
        engine.add(data.count);
        break;
      case 'remove':
        engine.remove(data.count);
        break;
      case 'scoop': {
        const ids = engine.scoop(data.count, data.shape);
        const xy = new Float32Array(ids.length * 2);
        ids.forEach((i, k) => {
          xy[2 * k] = engine.x[i]!;
          xy[2 * k + 1] = engine.y[i]!;
        });
        // Fewer than asked for: the ones to drop back are the first to go without.
        const drop = Math.max(0, ids.length - (data.count - data.extra));
        scooped.push({ ids: Int32Array.from(ids), xy, drop });
        break;
      }
      case 'clear':
        engine.clear();
        break;
      case 'resize':
        engine.resize(data.width, data.height);
        break;
      case 'grab':
        engine.grab(data.id);
        break;
      case 'release':
        engine.release(data.id, data.x, data.y, data.vx, data.vy);
        break;
      case 'destroy':
        engine.destroy(data.id);
        break;
      case 'setDropLine':
        engine.setDropLine(data.y);
        break;
    }
  };

  let last = performance.now();
  let lag = 0;
  let time = 0;

  const tick = () => {
    const now = performance.now();
    lag = Math.min(lag + (now - last), stepMs * MAX_STEPS_PER_TICK);
    last = now;
    let stepped = false;
    while (lag >= stepMs) {
      engine.step();
      lag -= stepMs;
      time += stepMs;
      stepped = true;
    }
    if (stepped) {
      post(engine, time, scooped);
      scooped = [];
    }
    setTimeout(tick, Math.max(0, stepMs - lag));
  };

  scope.postMessage({ type: 'ready' });
  post(engine, time, []);
  tick();
}

/** The frame for the tick that ended at `time`, with its buffers transferred rather than copied. */
function post(engine: PileEngine, time: number, scooped: Scoop[]) {
  const frame = frameOf(engine, time, scooped);
  scope.postMessage({ type: 'frame', frame }, frameBuffers(frame));
}

main().catch((error: unknown) => {
  scope.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  });
});
