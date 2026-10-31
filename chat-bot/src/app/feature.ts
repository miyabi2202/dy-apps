import type { EventBus, RoomEventMap } from './event-bus';

/**
 * Something the bot starts and stops as a whole. Making one listens to nothing: it hears the room
 * only between `start()` and `stop()`, so building the bot (or a test building a part of it) never
 * subscribes anyone by the way.
 */
export interface Feature {
  readonly name: string;
  start(): void;
  stop(): void;
}

/** What to do with each event of a room, by event name. */
export type RoomHandlers = { [K in keyof RoomEventMap]?: (payload: RoomEventMap[K]) => void };

/** A feature that is `handlers` subscribed to `bus` from `start()` to `stop()`, in the bus's order of subscribing. */
export function busFeature(
  name: string,
  bus: Pick<EventBus, 'on'>,
  handlers: RoomHandlers,
): Feature {
  let unsubscribe: (() => void)[] = [];
  return {
    name,
    start() {
      if (unsubscribe.length) return;
      for (const event of Object.keys(handlers) as (keyof RoomEventMap)[]) {
        const handler = handlers[event] as (payload: RoomEventMap[typeof event]) => void;
        unsubscribe.push(bus.on(event, handler));
      }
    },
    stop() {
      for (const off of unsubscribe) off();
      unsubscribe = [];
    },
  };
}
