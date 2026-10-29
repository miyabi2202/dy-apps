import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Transcriber } from '../app/songs/transcriber';
import type { Container } from './container';
import {
  BUS,
  LOG,
  OPTIONS,
  RECORD,
  ROOM_API,
  ROOM_DIR,
  SINGING,
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
          singing: c.resolve(SINGING),
          log: c.resolve(LOG),
          spawnWorker: c.resolve(SPAWN_WORKER),
          singingVoice: () => {
            const path = join(c.resolve(ROOM_DIR), 'singing-voices', 'voiceprint.npz');
            return existsSync(path) ? path : null;
          },
        })
      : null,
  );
}
