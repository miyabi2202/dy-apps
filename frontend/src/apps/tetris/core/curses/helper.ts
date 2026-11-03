import { CONFIG } from '../config';
import { randomInt } from '../random';
import { defineCurse } from './types';

/** 热心: just as the next piece locks, a kind viewer shoves it a column over, and it drops. */
export const helper = defineCurse({
  type: 'helper',
  name: '热心',
  description: (config) =>
    `接下来 ${config.effects.helperLocks} 块落定的一瞬间，被热心观众往左或右推一格（推不动就推另一边；卡在缝里就先拎起来再推），然后掉到底`,
  rarity: 'rare',
  queue: 'e',
  tagline: '不用谢 👍',
  durationLocks: CONFIG.effects.helperLocks,
  beforeLock: (ctx) => (randomInt(ctx.curseRng, 2) === 0 ? -1 : 1),
});
