import { RoomState, type RoomStateOptions } from '../src/app/room-state';
import { ChatHistory } from '../src/core/chat-history';

/** A RoomState with nothing happening in it, apart from what `options` give it. */
export function fakeRoom(options: Partial<RoomStateOptions> = {}): RoomState {
  return new RoomState({
    history: new ChatHistory(100),
    botName: '小助手',
    log: { debug() {}, info() {}, warn() {}, error() {} },
    ...options,
  });
}
