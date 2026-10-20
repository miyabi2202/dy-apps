import { errorMessage } from '../core/errors';
import { DOUYIN_CHAT_LIMIT, replyMessages, singleBudget } from '../core/reply';
import type { Gift } from '../core/room-events';
import { done, failed, type Command } from './command';
import type { Outbox } from './outbox';
import type { AskModel, Log, UserTalk } from './ports';
import type { RoomState } from './room-state';

export interface GiftThankerOptions {
  ask: AskModel;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (see buildPrompt), read each time so edits apply at once. */
  promptTemplate: () => string;
  /** Thank someone whose gifts within `windowMs` come to more than this many diamonds. */
  threshold: number;
  windowMs?: number;
  /** Once past the threshold, wait this long for the rest of a combo, so it's one thanks. */
  settleMs?: number;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
  /** The chat and the rest of what the prompt knows about the room. */
  room: RoomState;
  /** Each viewer's past exchanges with the bot; the thanks is added to the giver's. */
  userTalk?: UserTalk;
  /** Douyin's chat length limit. */
  maxLength?: number;
  log: Log;
}

interface Given {
  at: number;
  gift: Gift;
}

/**
 * Thanks a viewer whose gifts within `windowMs` (5 minutes) come to more than `threshold`
 * diamonds: Claude reads the room's chat, the viewer's own messages and their past exchanges
 * with the bot, and writes one warm, careful message to them. It waits `settleMs` (15 s) first,
 * so a combo is thanked once, with everything in it. Thanked gifts are done with: what they send
 * after counts afresh, and is thanked again once it passes the threshold too. The threshold can
 * be changed while it runs.
 */
export class GiftThanker {
  threshold: number;
  private readonly windowMs: number;
  /** Each viewer's gifts not thanked yet, by user id. */
  private readonly given = new Map<string, Given[]>();
  /** Viewers past the threshold, waiting out settleMs before they're thanked. */
  private readonly settling = new Set<string>();
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly options: GiftThankerOptions) {
    this.threshold = options.threshold;
    this.windowMs = options.windowMs ?? 5 * 60_000;
  }

  /**
   * Counts a gift, and once the giver's gifts not thanked yet (within the window) pass the
   * threshold, thanks them for all of those, after settleMs.
   */
  onGift(gift: Gift): void {
    const { userId } = gift;
    const now = this.options.room.now();
    const given = [...(this.given.get(userId) ?? []), { at: now, gift }].filter(
      (g) => g.at > now - this.windowMs,
    );
    this.given.set(userId, given);
    if (this.settling.has(userId) || total(given) <= this.threshold) return;
    this.settling.add(userId);
    const { settleMs = 15_000 } = this.options;
    const sleep =
      this.options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const run = sleep(settleMs)
      .then(() => {
        this.settling.delete(userId);
        const all = this.given.get(userId) ?? [];
        this.given.delete(userId);
        // Thanked by the name they last gave under.
        return this.thank(all.at(-1)?.gift ?? gift, all, total(all));
      })
      .finally(() => this.running.delete(run));
    this.running.add(run);
  }

  /** `/自动谢礼 100`: changes the threshold, until the bot stops. */
  commands(): Command[] {
    return [
      {
        name: '自动谢礼',
        adminOnly: true,
        price: 0,
        run: (args) => {
          if (!/^\d+$/.test(args)) return failed('阈值要写成钻石数，用法：/自动谢礼 100');
          this.threshold = Number(args);
          return done('已处理自动谢礼请求');
        },
      },
    ];
  }

  /** Resolves once every thanks under way has been written (or failed). */
  async idle(): Promise<void> {
    while (this.running.size) await Promise.all(this.running);
  }

  private async thank({ userId, nickname }: Gift, given: Given[], total: number): Promise<void> {
    const { ask, outbox, room, log, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    const counts = new Map<string, number>();
    for (const { gift } of given) counts.set(gift.name, (counts.get(gift.name) ?? 0) + gift.count);
    const gifts = [...counts].map(([name, count]) => `${name}×${count}`).join('、');
    const question = `刚刚送了 ${gifts}，一共 ${total} 钻`;
    const limits = { maxLength, maxParts: 1 };
    try {
      const prompt = room.prompt(this.options.promptTemplate(), {
        asker: nickname,
        question,
        singleLength: singleBudget(nickname, limits),
        maxLength,
        userHistory: this.options.userTalk?.recent(userId),
        userChat: room
          .recentChat()
          .filter((chat) => chat.userId === userId)
          .map((chat) => chat.content)
          .join('\n'),
      });
      log.info('thanking', { nickname, userId, gifts, total });
      log.debug('thanks prompt', { prompt });
      const [text] = replyMessages(nickname, await ask({ prompt }), limits);
      if (!text) {
        log.warn('claude had no thanks to give', { nickname });
        return;
      }
      outbox.push({ kind: 'reply', text });
      this.options.userTalk?.add(userId, { nickname, question: `（${question}）`, answer: text });
    } catch (err) {
      log.error('could not thank', {
        nickname,
        error: errorMessage(err),
      });
    }
  }
}

/** What `given` came to, in diamonds. */
const total = (given: readonly Given[]) => given.reduce((sum, g) => sum + g.gift.diamonds, 0);
