import { MAX_LIKES } from '@dy-apps/room-feed-protocol';
import { errorMessage } from '../core/errors';
import type { BotTool, Log, PressLike } from '../app/ports';

/** How many likes it gives when no number is given. */
const DEFAULT_LIKES = 100;

/**
 * `press_like`: gives the room some likes (100 unless told, up to room-feed's MAX_LIKES) as the
 * bot's account: room-feed holds Douyin's like key (z) on the live video until Douyin's counter
 * has about that many, and lets go early when Douyin says 手速太快了. Admin-only. `/点赞 [次数]` calls it
 * directly. It's done in silence: asked in words, the bot sends nothing back. With auto-reply on,
 * it listens (`listen.when`) for the streamer asking the room for likes, which reaches Claude
 * through Jev and the picker like any topic. The log has how many it gave and how long it held.
 */
export function pressLikeTool(like: PressLike, log: Log): BotTool {
  const usage = `用法：/点赞 次数（1 到 ${MAX_LIKES}，不写就是 ${DEFAULT_LIKES}）`;
  const valid = (likes: number) => Number.isInteger(likes) && likes >= 1 && likes <= MAX_LIKES;
  return {
    name: 'press_like',
    description: `给直播间点赞（默认 ${DEFAULT_LIKES} 个）。有人要你点赞、点几个赞时调用（你有这个工具，就说明问的人有权叫你点）；主播号召大家点赞（「大家帮我点点赞」）时也调用，用默认个数。调用后程序什么都不发，你也什么都不用说。`,
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
        const { liked, heldMs, tooFast } = await like(likes);
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
