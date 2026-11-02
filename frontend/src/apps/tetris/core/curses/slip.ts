import { CONFIG } from '../config';
import { randomInt } from '../random';
import { defineCurse } from './types';

interface SlipState {
  /** Play time since the last slide. */
  elapsedMs: number;
}

/**
 * 打滑: every `slipIntervalMs` the piece slides a column on its own, either way at random, or
 * the other way when that side is blocked. The timer restarts with each new piece.
 */
export const slip = defineCurse({
  type: 'slip',
  name: '打滑',
  description: (config) =>
    `方块每 ${config.effects.slipIntervalMs} ms 自己往左或右滑一格，持续 ${config.effects.slipLocks} 块`,
  rarity: 'uncommon',
  queue: 'e',
  cutscene: true,
  tagline: '闪身步',
  durationLocks: CONFIG.effects.slipLocks,
  initState: (): SlipState => ({ elapsedMs: 0 }),
  onSpawn(_ctx, piece, state) {
    state.elapsedMs = 0;
    return piece;
  },
  onTick(ctx, dtMs, state) {
    state.elapsedMs += dtMs;
    while (state.elapsedMs >= CONFIG.effects.slipIntervalMs) {
      state.elapsedMs -= CONFIG.effects.slipIntervalMs;
      const dx = randomInt(ctx.curseRng, 2) === 0 ? -1 : 1;
      if (!ctx.tryMove(dx)) ctx.tryMove(dx === 1 ? -1 : 1);
    }
  },
});
