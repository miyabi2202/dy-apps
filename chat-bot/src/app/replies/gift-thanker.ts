import { errorMessage } from '../../core/errors';
import { DOUYIN_CHAT_LIMIT, replyMessages, singleBudget } from '../../core/replies/reply';
import type { Gift } from '../../core/chat/room-events';
import { ModelFeature } from '../models/model-feature';
import type { Outbox } from './outbox';
import { Pending } from '../pending';
import type { AskModel, Log, SettingsStore, UserTalk } from '../ports';
import type { RoomState } from '../room/room-state';

export interface GiftThankerOptions {
  ask: AskModel;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (see buildPrompt), read each time so edits apply at once. */
  promptTemplate: () => string;
  /** The room's settings, where the threshold is kept (`thanksThreshold`): thank someone whose gifts within `windowMs` come to more than that many diamonds. */
  settings: SettingsStore;
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

/** Thanks to give: the last gift's giver, and everything they gave, `total` diamonds. */
interface Thanks {
  gift: Gift;
  given: Given[];
  total: number;
}

/**
 * Thanks a viewer whose gifts within `windowMs` (5 minutes) come to more than `threshold`
 * diamonds: Claude reads the room's chat, the viewer's own messages and their past exchanges
 * with the bot, and writes one warm, careful message to them. It waits `settleMs` (15 s) first,
 * so a combo is thanked once, with everything in it. Thanked gifts are done with: what they send
 * after counts afresh, and is thanked again once it passes the threshold too. The threshold can
 * be changed while it runs.
 */
export class GiftThanker extends ModelFeature<Thanks, string[]> {
  private readonly windowMs: number;
  /** Each viewer's gifts not thanked yet, by user id. */
  private readonly given = new Map<string, Given[]>();
  /** Viewers past the threshold, waiting out settleMs before they're thanked. */
  private readonly settling = new Set<string>();
  private readonly work = new Pending();

  constructor(private readonly options: GiftThankerOptions) {
    super(options.log);
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
    if (this.settling.has(userId) || total(given) <= this.options.settings.get().thanksThreshold)
      return;
    this.settling.add(userId);
    const { settleMs = 15_000 } = this.options;
    const sleep =
      this.options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.work.track(
      sleep(settleMs).then(() => {
        this.settling.delete(userId);
        const all = this.given.get(userId) ?? [];
        this.given.delete(userId);
        // Thanked by the name they last gave under.
        return this.run({ gift: all.at(-1)?.gift ?? gift, given: all, total: total(all) });
      }),
    );
  }

  /** Resolves once every thanks under way has been written (or failed). */
  idle(): Promise<void> {
    return this.work.idle();
  }

  protected buildPrompt({ gift: { userId, nickname }, given, total }: Thanks): string {
    const { room, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    return room.prompt(this.options.promptTemplate(), {
      asker: nickname,
      question: this.question(given, total),
      singleLength: singleBudget(nickname, this.limits()),
      maxLength,
      userHistory: this.options.userTalk?.recent(userId),
      askerNote: room.askerNote(userId),
      userChat: room
        .recentChat()
        .filter((chat) => chat.userId === userId)
        .map((chat) => chat.content)
        .join('\n'),
    });
  }

  protected async ask(
    { gift: { userId, nickname }, given, total }: Thanks,
    prompt: string,
  ): Promise<string[] | undefined> {
    const { log } = this.options;
    log.info('thanking', { nickname, userId, gifts: this.gifts(given), total });
    log.debug('thanks prompt', { prompt });
    const messages = replyMessages(nickname, await this.options.ask({ prompt }), this.limits());
    if (!messages.length) {
      log.warn('claude had no thanks to give', { nickname });
      return undefined;
    }
    return messages;
  }

  protected deliver(
    { gift: { userId, nickname }, given, total }: Thanks,
    messages: string[],
  ): void {
    for (const text of messages) this.options.outbox.push({ kind: 'reply', text });
    const question = `（${this.question(given, total)}）`;
    this.options.userTalk?.add(userId, { nickname, question, answer: messages.join(' ') });
  }

  protected failed({ gift: { nickname } }: Thanks, err: unknown): void {
    this.options.log.error('could not thank', { nickname, error: errorMessage(err) });
  }

  private limits() {
    return this.options.room.replyLimits(this.options.maxLength ?? DOUYIN_CHAT_LIMIT);
  }

  /** What was given, as `玫瑰×3、小心心×1`. */
  private gifts(given: readonly Given[]): string {
    const counts = new Map<string, number>();
    for (const { gift } of given) counts.set(gift.name, (counts.get(gift.name) ?? 0) + gift.count);
    return [...counts].map(([name, count]) => `${name}×${count}`).join('、');
  }

  /** What the prompt says they did. */
  private question(given: readonly Given[], total: number): string {
    return `刚刚送了 ${this.gifts(given)}，一共 ${total} 钻`;
  }
}

/** What `given` came to, in diamonds. */
const total = (given: readonly Given[]) => given.reduce((sum, g) => sum + g.gift.diamonds, 0);
