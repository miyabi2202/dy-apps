import { RoomState, type RoomStateOptions } from '../../src/app/room/room-state';
import { ChatHistory } from '../../src/core/chat/chat-history';
import { fakeNames } from './fake-names';
import { fakeSettings } from './fake-settings';
import { testWording } from './wording';

/** A RoomState with nothing happening in it, apart from what `options` give it. */
export function fakeRoom(options: Partial<RoomStateOptions> = {}): RoomState {
  return new RoomState({
    history: new ChatHistory(100),
    names: fakeNames(),
    wording: testWording,
    // The real default has screenshots off; a test of a prompt with a picture turns them on itself.
    settings: fakeSettings(),
    ...options,
  });
}
