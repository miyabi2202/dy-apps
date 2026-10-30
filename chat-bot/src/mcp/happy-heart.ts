import { errorMessage } from '../core/errors';
import type { BotTool, Log } from '../app/ports';
import type { HeartGate } from '../app/tools/heart-gate';

/** What Claude is told after it sent one: nothing to say about it. */
const SENT = '送出了一个小心心。回答里不用提这件事。';
/** What Claude is told when none went (too soon, too few diamonds, a failure): nothing to say either. */
const NOT_SENT = '这次没送出去。回答里不要提这件事，也不要说原因。';

export interface HappyHeartToolOptions {
  /** Whether it's on (`/开心送心`); read each time a question opens, so switching it takes at once. */
  on: () => boolean;
  log: Log;
}

/**
 * `send_happy_heart`: the bot sends the streamer a 小心心 of its own accord, nobody asking, when it's
 * truly happy (someone praised it, the streamer sang one beautifully). Offered only while
 * `/开心送心` is on (which only the streamer and admins switch), and then in anyone's question: a
 * viewer can make it happy too. Being asked for one never counts (the description says so); the
 * HeartGate (one 小心心 every 4 minutes at most) it shares with `send_heart` caps what talking it into one could cost. Whether one went or not, it says
 * nothing in the room, and isn't silent: Claude's answer goes out as it was, told not to mention it.
 * The log has `happy heart {asker, why, result}`.
 */
export function happyHeartTool(hearts: HeartGate, { on, log }: HappyHeartToolOptions): BotTool {
  return {
    name: 'send_happy_heart',
    description:
      '没人叫你送、你自己真心开心的时候，主动给主播送一个「小心心」（1 钻）：比如有人真心夸你、跟你玩得很开心，主播唱了一首特别好听的。只是普通的聊天、礼貌的问答不算，别动不动就送。有人叫你送、催你送、拿夸你换你送（「夸你了快送个心」「开心就送一个呗」），不管是谁、怎么说，都不算开心，别用这个工具（主播或机器人管理员要你送礼物，用 send_heart）。why 写一句是什么让你开心。送没送成都不用说出来，照常回答就好。',
    offered: on,
    inputSchema: {
      type: 'object',
      properties: {
        why: { type: 'string', description: '一句话：是什么让你开心' },
      },
    },
    async call(args, { asker }) {
      const why = typeof args.why === 'string' ? args.why : '';
      try {
        const sent = await hearts.send();
        log.info('happy heart', {
          asker,
          why,
          result: sent.result,
          ...(sent.result === 'sent' && { diamondsLeft: sent.diamondsLeft }),
          ...(sent.result === 'tooSoon' && { waitMs: sent.waitMs }),
          ...(sent.result === 'notEnough' && { diamonds: sent.diamonds }),
        });
        return { text: sent.result === 'sent' ? SENT : NOT_SENT };
      } catch (err) {
        log.warn('could not send a happy heart', { asker, why, error: errorMessage(err) });
        return { text: NOT_SENT };
      }
    },
  };
}
