import type { PileEngine } from './engine';
import type { Frame, Scoop } from './protocol';

/**
 * The frame for the engine's tick that ended at `time`: the moving icons' positions and the
 * newly settled, woken and `scooped` ones. Draining the settled and woken ones, so each goes
 * out in one frame only.
 */
export function frameOf(engine: PileEngine, time: number, scooped: Scoop[]): Frame {
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
  return {
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
    wokenIds: Int32Array.from(woken),
    scooped,
  };
}

/** The buffers in `frame` to transfer, rather than copy, when posting it. */
export function frameBuffers(frame: Frame): ArrayBuffer[] {
  return [
    frame.movingIds.buffer,
    frame.movingXy.buffer,
    frame.settledIds.buffer,
    frame.settledXy.buffer,
    frame.wokenIds.buffer,
    ...frame.scooped.flatMap((s) => [s.ids.buffer, s.xy.buffer]),
  ] as ArrayBuffer[];
}
