import { errorMessage } from '../core/errors';
import type { Gift, IncomingChat } from '../core/room-events';
import type { TranscriptLine } from '../core/transcript';
import type { Log } from './ports';

/** The events of a room, by name, and what each comes with. */
export interface RoomEventMap {
  /** An @mention of the bot, before the chat it's in joins the history. */
  mention: { chat: IncomingChat; question: string };
  /** A chat from someone but the bot, once it's in the history. */
  chat: IncomingChat;
  /** A gift worth diamonds, once it's been credited. */
  gift: Gift;
  /** A sentence the streamer said or sang, once it's in the transcript. */
  heard: TranscriptLine;
  /** The bot's answer to `userId` has been sent. */
  answered: { userId: string };
}

/**
 * Tells whoever subscribed about what happens in the room. Handlers run at once, in the order they
 * subscribed, one after the other; one that throws is logged and the others still run.
 */
export class EventBus<Events extends object = RoomEventMap> {
  private readonly handlers = new Map<keyof Events, ((payload: never) => void)[]>();

  constructor(private readonly log: Log) {}

  /** Calls `handler` with each `event` from now on; the returned function stops that. */
  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return () => {
      this.handlers.set(
        event,
        (this.handlers.get(event) ?? []).filter((h) => h !== handler),
      );
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    // A copy, so a handler subscribing or stopping meanwhile doesn't change who's called now.
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      try {
        (handler as (payload: Events[K]) => void)(payload);
      } catch (err) {
        this.log.error('event handler failed', { event, error: errorMessage(err) });
      }
    }
  }
}
