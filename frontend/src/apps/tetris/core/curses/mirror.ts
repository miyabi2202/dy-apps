import { CONFIG } from '../config';
import { defineCurse } from './types';

interface MirrorState {
  /** Whether the piece in play has its left and right swapped. */
  mirrored: boolean;
}

/**
 * 镜像: each fresh piece has the player's left and right swapped at `mirrorChance`, so the player
 * never knows until they press.
 */
export const mirror = defineCurse({
  type: 'mirror',
  name: '镜像',
  description: (config) =>
    `每块有 ${config.effects.mirrorChance * 100}% 的概率左右移动对调，持续 ${config.effects.mirrorRounds} 轮`,
  rarity: 'uncommon',
  queue: 'e',
  cutscene: true,
  tagline: '左就是右',
  durationRounds: CONFIG.effects.mirrorRounds,
  initState: (): MirrorState => ({ mirrored: false }),
  onSpawn(ctx, piece, state) {
    state.mirrored = ctx.curseRng.next() < CONFIG.effects.mirrorChance;
    return piece;
  },
  onMove(_ctx, dx, state) {
    return state.mirrored ? (-dx as -1 | 1) : dx;
  },
});
