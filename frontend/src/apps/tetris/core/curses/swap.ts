import { CONFIG } from '../config';
import { createPiece, PIECE_TYPES, shapeOf } from '../pieces';
import { randomInt } from '../random';
import { defineCurse } from './types';

/**
 * 调包: each fresh piece spawns as a different random one than the preview promised. A hold
 * swap is never touched, so the held piece is the one thing to trust.
 */
export const swap = defineCurse({
  type: 'swap',
  name: '调包',
  description: (config) => `出生的方块被换成和预览不同的块，持续 ${config.effects.swapRounds} 轮`,
  rarity: 'common',
  // Shares fog's queue: with the preview hidden, a swap couldn't be seen.
  queue: 'c',
  durationRounds: CONFIG.effects.swapRounds,
  onSpawn(ctx, piece) {
    const others = PIECE_TYPES.filter((t) => t !== piece.type);
    return createPiece(shapeOf(others[randomInt(ctx.curseRng, others.length)]!));
  },
});
