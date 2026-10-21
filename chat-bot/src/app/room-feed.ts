import type { ChatHistory } from '../core/chat-history';
import { chatRecord, giftRecord } from '../core/chat-record';
import { isFromBot, questionFor, type BotIdentity } from '../core/mention';
import type { Billing } from './billing';
import type { EventBus } from './event-bus';
import type { Log, RoomEvents, RoomRecord } from './ports';

export interface RoomFeedOptions {
  events: RoomEvents;
  /** Where it tells of each mention, chat and gift. */
  bus: Pick<EventBus, 'emit'>;
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
 * to their givers, and tells the bus of each @mention of the bot (with the question, the text
 * after the @), each chat from someone else and each gift worth diamonds. What to do with them is
 * up to whoever subscribed.
 */
export class RoomFeed {
  constructor(private readonly options: RoomFeedOptions) {}

  start(): void {
    const { events, bus, bot, history, log, record, billing } = this.options;
    events.onStatus((status, detail) => log.info(`room-feed ${status}`, detail ? { detail } : {}));
    events.onChat((chat) => {
      log.debug('chat', { ...chat });
      record?.add(chatRecord(chat));
      const question = isFromBot(chat, bot) ? null : questionFor(chat, bot);
      if (question !== null) bus.emit('mention', { chat, question });
      history.add(chat);
      if (!isFromBot(chat, bot)) bus.emit('chat', chat);
    });
    events.onGift((gift) => {
      record?.add(giftRecord(gift));
      if (gift.diamonds <= 0) return;
      billing?.credit(gift);
      log.info('gift', { ...gift, balance: billing?.balance(gift.userId) });
      bus.emit('gift', gift);
    });
    events.connect();
  }

  stop(): void {
    this.options.events.close();
  }
}
