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
 * directly. It's done in silence: asked in words, the bot sends nothing back. With auto-reply on,
 * it listens (`listen.when`) for the streamer asking the room for likes, which reaches Claude
 * through Jev and the picker like any topic. The log has how long it held.
 */
export function pressLikeTool(like: PressLike, log: Log): BotTool {
  const usage = `用法：/点赞 次数（1 到 ${MAX_LIKES}，不写就是 ${DEFAULT_LIKES}）`;
  const valid = (likes: number) => Number.isInteger(likes) && likes >= 1 && likes <= MAX_LIKES;
  return {
    name: 'press_like',
    description: `给直播间点赞（默认 ${DEFAULT_LIKES} 个）。主播或管理员要你点赞、点几个赞时调用；主播号召大家点赞（「大家帮我点点赞」）时也调用，用默认个数。调用后程序什么都不发，你也什么都不用说。`,
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
    listen: {
      when: '是主播本人在号召直播间里的大家点赞，比如「大家帮我点点赞」「记得点一下赞」「你们点赞呗」「一起点点赞吧」。不算的：在谢谢别人的点赞（「谢谢小雅的点赞」）、观众自己说点赞、主播说不用点赞、在聊点赞数',
    },
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
        // Sent: the program has answered them, so Claude says nothing (and nothing it says goes out).
        return {
          text: JSON.stringify({ sent: true, asked: likes, liked, stoppedByTooFast: tooFast }),
          silent: true,
        };
      } catch (err) {
        log.warn('could not like', { asker, error: errorMessage(err) });
        return { text: '现在点不了赞，请稍后再试', isError: true };
      }
    },
  };
}
