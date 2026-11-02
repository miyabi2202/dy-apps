import { CONFIG } from '../config';
import { randomInt } from '../random';
import { defineCurse } from './types';

interface DrunkState {
  /** Play time since the last stumble. */
  elapsedMs: number;
}

/**
 * 醉酒: the piece stumbles a column either way every `drunkStumbleMs`, a move sometimes goes the
 * wrong way (`drunkWrongChance`), and the board sways. The timer restarts with each new piece.
 */
export const drunk = defineCurse({
  type: 'drunk',
  name: '醉酒',
  description: (config) =>
    `方块每 ${config.effects.drunkStumbleMs} ms 自己晃一格，左右移动有 ${config.effects.drunkWrongChance * 100}% 会走反，棋盘跟着晃，持续 ${config.effects.drunkLocks} 块`,
  rarity: 'uncommon',
  queue: 'e',
  cutscene: true,
  tagline: '我没醉',
  durationLocks: CONFIG.effects.drunkLocks,
  boardEffect: 'sway',
  initState: (): DrunkState => ({ elapsedMs: 0 }),
  onSpawn(_ctx, piece, state) {
    state.elapsedMs = 0;
    return piece;
  },
  onTick(ctx, dtMs, state) {
    state.elapsedMs += dtMs;
    while (state.elapsedMs >= CONFIG.effects.drunkStumbleMs) {
      state.elapsedMs -= CONFIG.effects.drunkStumbleMs;
      ctx.tryMove(randomInt(ctx.curseRng, 2) === 0 ? -1 : 1);
    }
  },
  onMove(ctx, dx) {
    return ctx.curseRng.next() < CONFIG.effects.drunkWrongChance ? (-dx as -1 | 1) : dx;
  },
});
