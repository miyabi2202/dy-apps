import { CONFIG } from '../config';
import { stackHeight } from '../danger';
import { defineCurse } from './types';

/**
 * 假死: a fake game over. It waits, disguised as 垃圾行, until the stack is `fromHeight` of the
 * board tall, so dying looks real; then a few garbage rows push in from the bottom, shoving the
 * stack off the top, the game-over screen shows, and the rows slide back out under 骗你的. The
 * next piece falls 1 / `stunGravity` times as fast until the streamer presses a direction.
 */
export const fakeDeath = defineCurse({
  type: 'fakeDeath',
  name: '假死',
  description: (config) =>
    `伪装成垃圾行，等方块堆到 ${config.fakeDeath.fromHeight * 100}% 高才发动：假装被垃圾行顶死，结束画面放完再说"骗你的"；之后那一块下落速度变成 ${1 / config.fakeDeath.stunGravity} 倍，直到主播按方向键`,
  rarity: 'uncommon',
  queue: 'a',
  disguise: 'garbage',
  ready: (ctx) =>
    stackHeight(ctx.board) >= Math.round(ctx.board.length * CONFIG.fakeDeath.fromHeight),
  apply: () => ({ fakeGameOver: '垃圾行将方块挤出顶部' }),
});
