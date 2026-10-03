import type { EffectType, Side } from './types';

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
    slowPerLevel: 0.25,
    hasteMultipliers: [0.8, 0.65, 0.5],
  },
  score: {
    softDropPerCell: 1,
    hardDropPerCell: 2,
    /** Indexed by number of lines cleared at once. */
    lineClear: [0, 100, 300, 500, 800],
  },
  gifts: {
    defaultProbability: 0.6,
    probabilityOptions: [0, 0.25, 0.5, 0.6, 0.75, 1],
    minBatch: 1,
    maxBatch: 10_000,
    quickBatches: [1, 10, 100],
  },
  queue: {
    capacity: 3,
    nodeMaxEnergy: 7,
    reserveCapacity: 21,
    /** Minimum energy for Lv.1, Lv.2, Lv.3. */
    levelThresholds: [1, 3, 7],
    promoteMinLevel: 2,
    /** Nodes that have waited this many settlements cannot be overtaken. */
    waitProtection: 2,
  },
  settlement: { everyLocks: 3 },
  effects: {
    shieldMax: 6,
    longMaxCredits: 3,
    /** Duration of slow/haste, in locks. */
    timedLocks: 3,
  },
  log: { maxEntries: 10 },
  frame: { maxDtMs: 100 },
} as const;

export const EFFECT_POOLS: Record<Side, readonly EffectType[]> = {
  bless: ['shield', 'clear', 'long', 'slow'],
  curse: ['garbage', 'haste', 'fog', 'seal'],
};

export const SIDE_INFO: Record<Side, { name: string; short: string }> = {
  bless: { name: '祝福队', short: '祝福' },
  curse: { name: '诅咒队', short: '诅咒' },
};

export const GIFT_NAME = '星光';

export const EFFECT_INFO: Record<
  EffectType,
  { name: string; side: Side; levels: readonly [string, string, string] }
> = {
  shield: { name: '护盾', side: 'bless', levels: ['+1 层', '+2 层', '+3 层'] },
  clear: {
    name: '清障',
    side: 'bless',
    levels: ['移除底部 1 行', '移除底部 2 行', '移除底部 3 行'],
  },
  long: {
    name: '长条补给',
    side: 'bless',
    levels: ['接下来 1 个新生方块为 I', '接下来 2 个为 I', '接下来 3 个为 I'],
  },
  slow: { name: '缓速', side: 'bless', levels: ['下降间隔 ×1.25', '×1.5', '×1.75'] },
  garbage: { name: '垃圾行', side: 'curse', levels: ['+1 行', '+2 行', '+3 行'] },
  haste: { name: '加速', side: 'curse', levels: ['下降间隔 ×0.8', '×0.65', '×0.5'] },
  fog: { name: '迷雾', side: 'curse', levels: ['隐藏预览 1 块', '2 块', '3 块'] },
  seal: { name: '封存', side: 'curse', levels: ['禁用暂存 1 块', '2 块', '3 块'] },
};
