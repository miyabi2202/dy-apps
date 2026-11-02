/** Every gameplay number lives here. UI and engine code must not hard-code these. */
export const CONFIG = {
  board: { cols: 10, rows: 40 },
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
    /** A safety floor; with hastes bounded by their queue it is only reached late in a game. */
    minMs: 140,
    maxMs: 1800,
    /** Drop-interval multiplier per active haste; overlapping hastes multiply. */
    hasteMultiplier: 0.8,
  },
  score: {
    softDropPerCell: 1,
    hardDropPerCell: 2,
    /** Indexed by number of lines cleared at once. */
    lineClear: [0, 100, 300, 500, 800],
  },
  gifts: {
    defaultProbability: 0.95,
    /** The trigger chance's slider: whole percents from 1% to 100%. */
    probabilityRange: [0.01, 1],
    minBatch: 1,
    maxBatch: 10_000,
    quickBatches: [1, 10, 100],
    /** Gift batches kept for the right-hand info box. */
    historySize: 50,
    /** A hit picks a rarity by these weights, then one of that rarity's curses evenly. */
    rarityWeights: { common: 0.5, uncommon: 0.35, rare: 0.15 },
  },
  /** What viewers type in chat to steer the piece while 夺舍 is active; nothing else counts. */
  viewerCommands: { left: '左', right: '右', rotate: '转' },
  /** Viewers' recent commands the board shows at once. */
  viewerInputsShown: 6,
  effects: {
    /** Settlement rounds one firing lasts; each firing is its own instance. */
    hasteRounds: 3,
    fogRounds: 1,
    sealRounds: 1,
    swapRounds: 1,
    hastyRounds: 1,
    /** Locked pieces one firing lasts, for the curses with a cutscene. */
    noRotateLocks: 1,
    spinLocks: 1,
    slipLocks: 1,
    mirrorLocks: 1,
    /** A pair counts as one lock, so this is how many pairs one 双落 deals. */
    twinLocks: 1,
    possessLocks: 1,
    /** 夺舍's cutscene holds longer than the others, so viewers have time to read how to play. */
    possessIntroMs: 3000,
    giantLocks: 1,
    /** How many times bigger 巨大化 makes the piece: each cell becomes giantScale × giantScale. */
    giantScale: 2,
    drunkLocks: 1,
    /** How often 醉酒 stumbles the piece a column on its own. */
    drunkStumbleMs: 900,
    /** How often a move goes the wrong way while 醉酒. */
    drunkWrongChance: 0.3,
    lagLocks: 1,
    /** How late every command acts while 延迟. */
    lagMs: 400,
    /** How often 自转 turns the piece. */
    spinIntervalMs: 500,
    /** How often 打滑 pushes the piece a column. */
    slipIntervalMs: 700,
    /** Upcoming pieces 烂牌 turns into S or Z. */
    snakesPieces: 3,
    /** Stones one 落石 drops: from 1 to this many. */
    rockfallMax: 2,
  },
  settlement: { everyLocks: 5 },
  /**
   * A quiet room: after this many settlements in a row with nothing pending, the game draws a
   * curse itself, the way a gift would, and it fires at that settlement.
   */
  quiet: { settlements: 5 },
  /** Clearing at least this many lines at once cancels one pending curse, rarest first. */
  relief: { minLines: 2 },
  /** Before the piece of a curse with `cutscene`: its name, then READY, then GO. */
  cutscene: { introMs: 1500, readyMs: 500, goMs: 500 },
  log: { maxEntries: 10 },
  frame: { maxDtMs: 100 },
} as const;
