import type { EffectType } from './types';

/** Every gameplay number lives here. UI and engine code must not hard-code these. */
export const CONFIG = {
  board: { cols: 10, rows: 20 },
  sequence: {
    /** Upcoming pieces kept internally. */
    minBuffer: 5,
    /** Upcoming pieces shown in the preview. */
    visiblePreview: 3,
  },
  input: { dasMs: 150, arrMs: 45, softDropRepeatMs: 45 },
  lock: { delayMs: 500, maxResets: 12 },
  gravity: {
    baseMs: 850,
    minBaseMs: 280,
    stepMs: 65,
    linesPerStep: 10,
    minMs: 140,
    maxMs: 1800,
    /** Drop-interval multiplier per haste; it stacks for the rest of the game. */
    hasteMultiplier: 0.8,
  },
  score: {
    softDropPerCell: 1,
    hardDropPerCell: 2,
    /** Indexed by number of lines cleared at once. */
    lineClear: [0, 100, 300, 500, 800],
  },
  gifts: {
    defaultProbability: 0.15,
    probabilityOptions: [0.1, 0.15, 0.2],
    minBatch: 1,
    maxBatch: 10_000,
    quickBatches: [1, 10, 100],
    /** Gift batches kept for the right-hand info box. */
    historySize: 50,
  },
  effects: {
    /** Pieces that one fog / seal lasts. */
    fogLocks: 3,
    sealLocks: 3,
  },
  settlement: { everyLocks: 3 },
  log: { maxEntries: 10 },
  frame: { maxDtMs: 100 },
} as const;

export const EFFECT_POOL: readonly EffectType[] = ['garbage', 'haste', 'fog', 'seal'];

export const GIFT_NAME = '星光';

/** What one curse does when it fires. */
export const EFFECT_INFO: Record<EffectType, { name: string; description: string }> = {
  garbage: { name: '垃圾行', description: '底部加 1 行垃圾' },
  haste: { name: '加速', description: '下降间隔永久 ×0.8，可叠加' },
  fog: { name: '迷雾', description: '隐藏预览 3 块' },
  seal: { name: '封存', description: '禁用暂存 3 块' },
};
