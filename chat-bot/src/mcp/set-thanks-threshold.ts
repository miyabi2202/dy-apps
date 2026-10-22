import type { GiftThanker } from '../app/replies/gift-thanker';
import type { BotTool } from './rpc';

/** The threshold that leaves gifts unthanked, as `/自动谢礼 99999` does. */
const OFF = 99999;

/**
 * `set_thanks_threshold`: what `/自动谢礼 <钻>` does, for an admin who asks in words (「以后 100 钻以下的
 * 礼物不用谢了」「把谢礼关了」). Admin-only, so anyone else's question doesn't have it. It answers the
 * threshold before and after, for Claude to say in its own words.
 */
export function setThanksThresholdTool(thanker: Pick<GiftThanker, 'threshold'>): BotTool {
  return {
    name: 'set_thanks_threshold',
    command: '自动谢礼',
    adminOnly: true,
    description: `改自动谢礼的门槛：观众 5 分钟内送的礼物超过 diamonds 钻就谢 TA。有人要开、关自动谢礼或改门槛时调用（「以后 100 钻以下的礼物不用谢了」就填 100）；关掉就填 ${OFF}。`,
    inputSchema: {
      type: 'object',
      properties: {
        diamonds: { type: 'integer', minimum: 0, description: `钻石数；关掉自动谢礼填 ${OFF}` },
      },
      required: ['diamonds'],
    },
    call(args) {
      const { diamonds } = args;
      if (typeof diamonds !== 'number' || !Number.isInteger(diamonds) || diamonds < 0) {
        return Promise.resolve({ text: 'diamonds 要写成钻石数（非负整数）', isError: true });
      }
      const before = thanker.threshold;
      thanker.threshold = diamonds;
      return Promise.resolve({
        text: JSON.stringify({ before, after: diamonds, on: diamonds < OFF }),
      });
    },
  };
}
