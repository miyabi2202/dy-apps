import { EventBus } from '../../src/app/event-bus';
import { Outbox } from '../../src/app/replies/outbox';
import type { Log, RoomEvents } from '../../src/app/ports';
import type { Gift, IncomingChat } from '../../src/core/chat/room-events';

export const BOT = { nickname: '小助手', userId: 'bot-1' };
export const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);

export const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };

let nextId = 0;

/** A chat message; the bot's own when `nickname` is the bot's. */
export function chat(
  nickname: string,
  content: string,
  mentions: IncomingChat['mentions'] = [],
): IncomingChat {
  nextId++;
  const userId = nickname === BOT.nickname ? BOT.userId : `u-${nickname}`;
  return { ts: nextId, userId, nickname, content, mentions };
}

/** A gift of `count` of something worth `diamondCount` diamonds each. */
export function gift(nickname: string, count: number, diamondCount: number): Gift {
  return { userId: `u-${nickname}`, nickname, name: '玫瑰', count, diamonds: count * diamondCount };
}

/** A real bus, as the room's features get it. */
export const fakeBus = () => new EventBus(silentLog);

/** Room events the test fires by hand. */
export function fakeEvents() {
  let onChat: (chat: IncomingChat) => void = () => {};
  let onGift: (gift: Gift) => void = () => {};
  const events: RoomEvents = {
    onChat: (handler) => (onChat = handler),
    onGift: (handler) => (onGift = handler),
    onStatus: () => {},
    connect: () => {},
    close: () => {},
  };
  return {
    events,
    say: (event: IncomingChat) => onChat(event),
    give: (event: Gift) => onGift(event),
  };
}

/** An outbox that sends at once, into `sent`: spacing is the outbox's own test. */
export function fakeOutbox() {
  const sent: string[] = [];
  const outbox = new Outbox({
    send: (text) => {
      sent.push(text);
      return Promise.resolve({ echoed: true });
    },
    log: silentLog,
    sleep: () => Promise.resolve(),
  });
  return { outbox, sent };
}
