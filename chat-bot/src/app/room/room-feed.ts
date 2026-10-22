import type { ChatHistory } from '../../core/chat/chat-history';
import { chatRecord, giftRecord } from '../../core/chat/chat-record';
import { isFromBot, questionFor, type BotIdentity } from '../../core/chat/mention';
import type { EventBus } from '../event-bus';
import type { Log, RoomEvents, RoomRecord } from '../ports';

/**
 * Calls `onGone` once when room-feed goes away after the bot was connected to it: it exits when
 * the stream has ended or its page showed another room, and there's nothing left to do then. Its
 * `ended` status says why first (the detail), so that's what `onGone` gets; a room-feed that just
 * went (stopped by hand, crashed) gives only the socket's error. A room-feed that isn't up yet
 * when the bot starts isn't gone: the client keeps trying.
 */
export function whenRoomFeedGone(
  events: Pick<RoomEvents, 'onStatus'>,
  onGone: (detail?: string) => void,
): void {
  let connected = false;
  let gone = false;
  events.onStatus((status, detail) => {
    if (status === 'roomConnecting' || status === 'ready') connected = true;
    else if (gone) return;
    else if (status === 'ended' || ((status === 'closed' || status === 'error') && connected)) {
      gone = true;
      onGone(detail);
    }
  });
}

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
}

/**
 * Listens to the room: records each chat and gift, keeps the chat in the history, and tells the
 * bus of each @mention of the bot (with the question, the text after the @), each chat from someone else and each gift worth diamonds. What to do with them is
 * up to whoever subscribed.
 */
export class RoomFeed {
  constructor(private readonly options: RoomFeedOptions) {}

  start(): void {
    const { events, bus, bot, history, log, record } = this.options;
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
      log.info('gift', gift);
      bus.emit('gift', gift);
    });
    events.connect();
  }

  stop(): void {
    this.options.events.close();
  }
}
