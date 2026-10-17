import { buildPrompt } from '../core/prompt';
import { replyMessages } from '../core/reply';
import type { ChatLine, Gift } from '../core/room-events';
import type { Persona } from './commands';
import type { Outbox } from './outbox';
import type { AskClaude, BotTalk, Log, UserTalk } from './ports';

export interface GiftThankerOptions {
  ask: AskClaude;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (see buildPrompt), read each time so edits apply at once. */
  promptTemplate: () => string;
  /** Thank someone whose gifts within `windowMs` come to more than this many diamonds. */
  threshold: number;
  windowMs?: number;
  /** The room's recent chat, oldest first. */
  recentChat: () => ChatLine[];
  /** Each viewer's past exchanges with the bot; the thanks is added to the giver's. */
  userTalk?: UserTalk;
  botTalk?: Pick<BotTalk, 'recent'>;
  context?: () => string;
  persona?: Persona;
  chatDir?: string;
  /** Douyin's chat length limit. */
  maxLength?: number;
  log: Log;
  now?: () => number;
}

interface Given {
  at: number;
  gift: Gift;
}

/**
 * Thanks a viewer whose gifts within `windowMs` (5 minutes) come to more than `threshold`
 * diamonds: Claude reads the room's chat, the viewer's own messages and their past exchanges
 * with the bot, and writes one warm, careful message to them. A viewer is thanked at most once
 * a window. The threshold can be changed while it runs.
 */
export class GiftThanker {
  threshold: number;
  private readonly windowMs: number;
  private readonly given = new Map<string, Given[]>();
  private readonly thankedAt = new Map<string, number>();
  private readonly running = new Set<Promise<void>>();
  private readonly now: () => number;

  constructor(private readonly options: GiftThankerOptions) {
    this.threshold = options.threshold;
    this.windowMs = options.windowMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  /** Counts a gift, and thanks the giver once their window's gifts pass the threshold. */
  onGift(gift: Gift): void {
    const now = this.now();
    const since = now - this.windowMs;
    const given = [...(this.given.get(gift.userId) ?? []), { at: now, gift }].filter(
      (g) => g.at > since,
    );
    this.given.set(gift.userId, given);
    const total = given.reduce((sum, g) => sum + g.gift.diamonds, 0);
    const thanked = this.thankedAt.get(gift.userId);
    if (total <= this.threshold || (thanked !== undefined && thanked > since)) return;
    this.thankedAt.set(gift.userId, now);
    this.given.delete(gift.userId);
    const run = this.thank(gift, given, total).finally(() => this.running.delete(run));
    this.running.add(run);
  }

  /** Resolves once every thanks under way has been written (or failed). */
  async idle(): Promise<void> {
    while (this.running.size) await Promise.all(this.running);
  }

  private async thank({ userId, nickname }: Gift, given: Given[], total: number): Promise<void> {
    const { ask, outbox, log, maxLength = 49 } = this.options;
    const counts = new Map<string, number>();
    for (const { gift } of given) counts.set(gift.name, (counts.get(gift.name) ?? 0) + gift.count);
    const gifts = [...counts].map(([name, count]) => `${name}×${count}`).join('、');
    const history = this.options.recentChat();
    const question = `刚刚送了 ${gifts}，一共 ${total} 钻`;
    const limits = { maxLength, maxParts: 1 };
    try {
      const prompt = buildPrompt(this.options.promptTemplate(), {
        history,
        transcript: [],
        asker: nickname,
        question,
        singleLength: maxLength - [...`@${nickname} `].length,
        maxLength,
        now: this.now(),
        chatDir: this.options.chatDir,
        persona: this.options.persona?.value,
        context: this.options.context?.(),
        botTalk: this.options.botTalk?.recent(),
        userHistory: this.options.userTalk?.recent(userId),
        userChat: history
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
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
