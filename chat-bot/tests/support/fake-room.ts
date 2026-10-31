import { RoomState, type RoomStateOptions } from '../../src/app/room/room-state';
import { ChatHistory } from '../../src/core/chat/chat-history';
import { fakeSettings } from './fake-settings';
import { testWording } from './wording';

/** A RoomState with nothing happening in it, apart from what `options` give it. */
export function fakeRoom(options: Partial<RoomStateOptions> = {}): RoomState {
  return new RoomState({
    history: new ChatHistory(100),
    botName: '小助手',
    // Screenshots on, which the tests of a prompt with a picture rely on; the real default is off.
    settings: fakeSettings({ screenshots: true }),
    wording: testWording,
    log: { debug() {}, info() {}, warn() {}, error() {} },
    ...options,
  });
}
