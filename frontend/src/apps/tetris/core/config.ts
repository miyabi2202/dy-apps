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
    /** The trigger chance's slider: whole percents from 1% to 100%. */
    probabilityRange: [0.01, 1],
    minBatch: 1,
    maxBatch: 10_000,
    quickBatches: [1, 10, 100],
    /** Gift batches kept for the right-hand info box. */
    historySize: 50,
  },
  effects: {
    /** Locked pieces that one fog / seal lasts; firing again adds as many more. */
    fogLocks: 1,
    sealLocks: 1,
  },
  settlement: { everyLocks: 3 },
  log: { maxEntries: 10 },
  frame: { maxDtMs: 100 },
} as const;
