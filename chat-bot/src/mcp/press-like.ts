import { errorMessage } from '../core/errors';
import type { BotTool, Log, PressLike } from '../app/ports';

/** How many likes a second of holding Douyin's like key makes. */
const LIKES_PER_SECOND = 20;
/** Held this much longer than the likes come to, so the last ones aren't cut short. */
const EXTRA_SECONDS = 1;
/** How many likes it gives when no number is given. */
const DEFAULT_LIKES = 100;
/** The most it gives at once: 26 s held, well within room-feed's MAX_LIKE_SECONDS. */
const MAX_LIKES = 500;

/**
 * `press_like`: gives the room some likes (100 unless told) as the bot's account, by holding
 * Douyin's like key (z) on the live video, a second for every LIKES_PER_SECOND and EXTRA_SECONDS
 * more, and letting go early when Douyin says 手速太快了. Admin-only. `/点赞 [次数]` calls it
 * directly and says nothing; the log has how long it held.
 */
export function pressLikeTool(like: PressLike, log: Log): BotTool {
  const usage = `用法：/点赞 次数（1 到 ${MAX_LIKES}，不写就是 ${DEFAULT_LIKES}）`;
  const valid = (likes: number) => Number.isInteger(likes) && likes >= 1 && likes <= MAX_LIKES;
  return {
    name: 'press_like',
    description: `给直播间点赞（默认 ${DEFAULT_LIKES} 个）。主播或管理员要你点赞、点几个赞时调用。`,
    adminOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        likes: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIKES,
          description: `点几个赞，没说就是 ${DEFAULT_LIKES}`,
        },
      },
    },
    commands: [
      {
        name: '点赞',
        parse: (args) => {
          const typed = args.trim();
          if (!typed) return { args: { likes: DEFAULT_LIKES } };
          const likes = /^\d+$/.test(typed) ? Number(typed) : NaN;
          return valid(likes) ? { args: { likes } } : { usage };
        },
        // Liking says nothing in the room.
        say: () => '',
      },
    ],
    async call(args, { asker }) {
      const likes = args.likes ?? DEFAULT_LIKES;
      if (typeof likes !== 'number' || !valid(likes)) {
        return { text: `likes 要写成 1 到 ${MAX_LIKES} 的整数`, isError: true };
      }
      try {
        const { heldMs, tooFast } = await like(likes / LIKES_PER_SECOND + EXTRA_SECONDS);
        // What the time held comes to, the extra second not counted, and never more than asked.
        const held = Math.max(heldMs / 1000 - EXTRA_SECONDS, 0);
        const liked = Math.min(Math.round(held * LIKES_PER_SECOND), likes);
        log.info('liked', { asker, likes, liked, heldMs, tooFast });
        return { text: JSON.stringify({ asked: likes, liked, stoppedByTooFast: tooFast }) };
      } catch (err) {
        log.warn('could not like', { asker, error: errorMessage(err) });
        return { text: '现在点不了赞，请稍后再试', isError: true };
      }
    },
  };
}
