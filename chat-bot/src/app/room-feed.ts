import type { ChatHistory } from '../core/chat-history';
import { chatRecord, giftRecord } from '../core/chat-record';
import { isFromBot, questionFor, type BotIdentity } from '../core/mention';
import type { Gift, IncomingChat } from '../core/room-events';
import type { Billing } from './billing';
import type { Log, RoomEvents, RoomRecord } from './ports';

export interface RoomFeedOptions {
  events: RoomEvents;
  bot: BotIdentity;
  /** The room's recent chat: every chat joins it, after any mention in it has been handled. */
  history: ChatHistory;
  log: Log;
  /** Where the room's chat and gifts are recorded for Claude to read. */
  record?: RoomRecord;
  /** Credits what viewers gift, to pay for mentions with. Without it, gifts count for nothing. */
  billing?: Pick<Billing, 'credit' | 'balance'>;
}

/**
 * Listens to the room: records each chat and gift, keeps the chat in the history, credits gifts
 * to their givers, and tells whoever subscribed about each @mention of the bot (with the
 * question, the text after the @) and each gift worth diamonds. What to do with them is up to
 * the subscribers.
 */
export class RoomFeed {
  private readonly mentionHandlers: ((chat: IncomingChat, question: string) => void)[] = [];
  private readonly giftHandlers: ((gift: Gift) => void)[] = [];
  private readonly chatHandlers: ((chat: IncomingChat) => void)[] = [];

  constructor(private readonly options: RoomFeedOptions) {}

  /** Calls `handler` for each @mention of the bot, before the chat it's in joins the history. */
  onMention(handler: (chat: IncomingChat, question: string) => void): void {
    this.mentionHandlers.push(handler);
  }

  /** Calls `handler` for each chat from someone but the bot, once it's in the history. */
  onChat(handler: (chat: IncomingChat) => void): void {
    this.chatHandlers.push(handler);
  }

  /** Calls `handler` for each gift worth diamonds, once it's been credited. */
  onGift(handler: (gift: Gift) => void): void {
    this.giftHandlers.push(handler);
  }

  start(): void {
    const { events, bot, history, log, record, billing } = this.options;
    events.onStatus((status, detail) => log.info(`dyhub ${status}`, detail ? { detail } : {}));
    events.onChat((chat) => {
      log.debug('chat', { ...chat });
      record?.add(chatRecord(chat));
      const question = isFromBot(chat, bot) ? null : questionFor(chat, bot);
      if (question !== null) {
        for (const handler of this.mentionHandlers) handler(chat, question);
      }
      history.add(chat);
      if (!isFromBot(chat, bot)) for (const handler of this.chatHandlers) handler(chat);
    });
    events.onGift((gift) => {
      record?.add(giftRecord(gift));
      if (gift.diamonds <= 0) return;
      billing?.credit(gift);
      log.info('gift', { ...gift, balance: billing?.balance(gift.userId) });
      for (const handler of this.giftHandlers) handler(gift);
    });
    events.connect();
  }

  stop(): void {
    this.options.events.close();
  }
}
