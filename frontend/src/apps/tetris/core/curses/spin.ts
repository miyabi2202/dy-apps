import { CONFIG } from '../config';
import { defineCurse } from './types';

interface SpinState {
  /** Play time since the last turn. */
  elapsedMs: number;
}

/**
 * 自转: the piece turns clockwise on its own every `spinIntervalMs` and the player cannot
 * rotate, soft-drop or hard-drop it; it falls at the game's own speed. A turn that no kick fits is skipped; the timer restarts with each new piece.
 */
export const spin = defineCurse({
  type: 'spin',
  name: '自转',
  description: (config) =>
    `方块每 ${config.effects.spinIntervalMs} ms 自动旋转，无法手动旋转、软降、硬降，持续 ${config.effects.spinLocks} 块`,
  rarity: 'rare',
  queue: 'e',
  durationLocks: CONFIG.effects.spinLocks,
  blocks: ['rotate', 'softDrop', 'hardDrop'],
  initState: (): SpinState => ({ elapsedMs: 0 }),
  onSpawn(_ctx, piece, state) {
    state.elapsedMs = 0;
    return piece;
  },
  onTick(ctx, dtMs, state) {
    state.elapsedMs += dtMs;
    while (state.elapsedMs >= CONFIG.effects.spinIntervalMs) {
      state.elapsedMs -= CONFIG.effects.spinIntervalMs;
      ctx.tryRotate(1);
    }
  },
});
