import { PILE } from '../core/config';
import type { Rng } from '../core/engine';
import type { Frame } from '../core/protocol';

/** A small seeded generator, so a test's pile is the same every run. */
export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A frame from the worker, with whatever a test cares about filled in. */
export function frame(
  parts: Partial<
    Omit<Frame, 'movingIds' | 'movingXy' | 'settledIds' | 'settledXy' | 'wokenIds'>
  > & {
    moving?: [id: number, x: number, y: number][];
    settled?: [id: number, x: number, y: number][];
    woken?: number[];
  } = {},
): Frame {
  const moving = parts.moving ?? [];
  const settled = parts.settled ?? [];
  return {
    time: parts.time ?? 0,
    width: parts.width ?? PILE.world.width,
    height: parts.height ?? PILE.world.height,
    total: parts.total ?? 0,
    queued: parts.queued ?? 0,
    generation: parts.generation ?? 0,
    movingIds: Int32Array.from(moving.map(([id]) => id)),
    movingXy: Float32Array.from(moving.flatMap(([, x, y]) => [x, y])),
    settledIds: Int32Array.from(settled.map(([id]) => id)),
    settledXy: Float32Array.from(settled.flatMap(([, x, y]) => [x, y])),
    wokenIds: Int32Array.from(parts.woken ?? []),
  };
}
