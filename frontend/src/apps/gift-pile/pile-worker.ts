import RAPIER from '@dimforge/rapier2d-compat';
import { PILE } from './core/config';
import { PileEngine } from './core/engine';
import type { Frame, FromWorker, ToWorker } from './core/protocol';

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

  scope.onmessage = ({ data }) => {
    switch (data.type) {
      case 'add':
        engine.add(data.count);
        break;
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
        engine.release(data.id, data.x, data.y);
        break;
      case 'destroy':
        engine.destroy(data.id);
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
    if (stepped) post(engine, time);
    setTimeout(tick, Math.max(0, stepMs - lag));
  };

  scope.postMessage({ type: 'ready' });
  post(engine, time);
  tick();
}

/** The moving icons' positions and the newly settled and woken ones, in transferred buffers. */
function post(engine: PileEngine, time: number) {
  const movingIds = new Int32Array(engine.movingCount);
  const movingXy = new Float32Array(engine.movingCount * 2);
  let m = 0;
  engine.forEachMoving((i) => {
    movingIds[m] = i;
    movingXy[2 * m] = engine.x[i]!;
    movingXy[2 * m + 1] = engine.y[i]!;
    m++;
  });
  const settled: number[] = [];
  engine.drainSettled((i) => settled.push(i));
  const settledIds = Int32Array.from(settled);
  const settledXy = new Float32Array(settled.length * 2);
  settled.forEach((i, k) => {
    settledXy[2 * k] = engine.x[i]!;
    settledXy[2 * k + 1] = engine.y[i]!;
  });
  const woken: number[] = [];
  engine.drainWoken((i) => woken.push(i));
  const wokenIds = Int32Array.from(woken);
  const frame: Frame = {
    time,
    width: engine.width,
    height: engine.height,
    total: engine.alive,
    queued: engine.queued,
    generation: engine.generation,
    movingIds,
    movingXy,
    settledIds,
    settledXy,
    wokenIds,
  };
  scope.postMessage({ type: 'frame', frame }, [
    movingIds.buffer,
    movingXy.buffer,
    settledIds.buffer,
    settledXy.buffer,
    wokenIds.buffer,
  ]);
}

main().catch((error: unknown) => {
  scope.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  });
});
