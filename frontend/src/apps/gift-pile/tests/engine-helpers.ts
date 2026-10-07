import RAPIER from '@dimforge/rapier2d-compat';
import { PILE, type PileSettings } from '../core/config';
import { PileEngine } from '../core/engine';
import { mulberry32 } from './helpers';

// Rapier needs Node's globals (TextDecoder, WebAssembly), so tests using this run with
// `@jest-environment node`. Rapier is deterministic for a seed, so every scenario here is
// repeatable to the pixel.

/** The WASM module, initialised once for all tests. */
const rapier = RAPIER.init().then(() => RAPIER);

/** An engine on a small world (200 × 300 unless given), so piles settle in few steps. */
export async function createEngine(
  settings: Partial<PileSettings> = {},
  seed = 1,
): Promise<PileEngine> {
  return new PileEngine({
    rapier: await rapier,
    settings: { ...PILE, world: { width: 200, height: 300 }, ...settings },
    rng: mulberry32(seed),
  });
}

/** Steps `n` times. */
export function step(engine: PileEngine, n: number): void {
  for (let s = 0; s < n; s++) engine.step();
}

/**
 * Steps until nothing is queued or moving, and fails if that takes more than `maxSeconds`
 * of simulation: an icon that never rests but never falls is floating too.
 */
export function settle(engine: PileEngine, maxSeconds = 30): void {
  const maxSteps = maxSeconds * PILE.stepHz;
  for (let s = 0; s < maxSteps && (engine.queued > 0 || engine.movingCount > 0); s++) {
    engine.step();
  }
  if (engine.queued > 0 || engine.movingCount > 0) {
    throw new Error(
      `still moving after ${maxSeconds} s: ${engine.movingCount} moving, ${engine.queued} queued`,
    );
  }
}

/** Every icon that is at rest, by index. */
export function restingIcons(engine: PileEngine): number[] {
  const ids: number[] = [];
  for (let i = 0; i < engine.count; i++) if (engine.resting[i]) ids.push(i);
  return ids;
}

/** The icons currently moving. */
export function movingIcons(engine: PileEngine): number[] {
  const ids: number[] = [];
  engine.forEachMoving((i) => ids.push(i));
  return ids;
}

/** Whether icons `i` and `j` touch: centres within `2r + 1` px (soft contacts leave a gap). */
export function touching(engine: PileEngine, i: number, j: number): boolean {
  const dx = engine.x[i]! - engine.x[j]!;
  const dy = engine.y[i]! - engine.y[j]!;
  return Math.hypot(dx, dy) <= 2 * engine.radius + 1;
}

/** The resting icons touching `i`. */
export function neighbours(engine: PileEngine, i: number, ids = restingIcons(engine)): number[] {
  return ids.filter((j) => j !== i && touching(engine, i, j));
}

/**
 * The resting icons with no path to the floor through touching resting icons: the pile's
 * one invariant (see edge-cases.md). Only an icon whose centre is within 1 px of the floor
 * anchors; a wall holds nothing up. Empty means the pile is honest.
 */
export function floating(engine: PileEngine): number[] {
  const ids = restingIcons(engine);
  const { x, y, radius: r } = engine;
  const d = 2 * r;
  const floor = engine.height - engine.margin - r;
  // A grid of cells `d` across, so each icon only looks at its 3 × 3 neighbourhood.
  const key = (px: number, py: number) => `${Math.floor(px / d)},${Math.floor(py / d)}`;
  const grid = new Map<string, number[]>();
  for (const i of ids) {
    const k = key(x[i]!, y[i]!);
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  }
  const reached = new Set<number>();
  const queue = ids.filter((i) => y[i]! >= floor - 1);
  for (const i of queue) reached.add(i);
  while (queue.length) {
    const i = queue.pop()!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of grid.get(key(x[i]! + dx * d, y[i]! + dy * d)) ?? []) {
          if (!reached.has(j) && touching(engine, i, j)) {
            reached.add(j);
            queue.push(j);
          }
        }
      }
    }
  }
  return ids.filter((i) => !reached.has(i));
}

/** Grabs and destroys each of `ids`: `remove()` with a chosen list instead of a random one. */
export function destroyAll(engine: PileEngine, ids: Iterable<number>): void {
  for (const i of ids) {
    engine.grab(i);
    engine.destroy(i);
  }
}
