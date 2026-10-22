import { Transcriber } from '../app/transcriber';
import type { Container } from './container';
import {
  BUS,
  GUEST_SINGING,
  LOG,
  OPTIONS,
  RECORD,
  ROOM_API,
  SPAWN_WORKER,
  TRANSCRIBER,
  TRANSCRIPT,
} from './tokens';

/** Hears the streamer: the speech worker's transcript of the stream. Null with --no-asr. */
export function registerTranscriber(container: Container): void {
  container.register(TRANSCRIBER, (c) =>
    c.resolve(OPTIONS).asr
      ? new Transcriber({
          streamUrl: c.resolve(ROOM_API).streamUrl,
          bus: c.resolve(BUS),
          transcript: c.resolve(TRANSCRIPT),
          record: c.resolve(RECORD),
          guestSinging: c.resolve(GUEST_SINGING),
          log: c.resolve(LOG),
          spawnWorker: c.resolve(SPAWN_WORKER),
        })
      : null,
  );
}
