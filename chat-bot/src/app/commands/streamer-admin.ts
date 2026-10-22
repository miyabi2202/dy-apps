import { errorMessage } from '../../core/errors';
import type { Admins, FindStreamer, Log } from '../ports';

export interface StreamerAdminOptions {
  /** The admins from config.json. */
  admins: Admins;
  find: FindStreamer;
  /** Told who the streamer is, once found. */
  onFound?: (streamer: { uid: string; nickname: string }) => void;
  log: Log;
  /** How long to wait before asking again while the streamer isn't known. */
  retryMs?: number;
  schedule?: (run: () => void, ms: number) => void;
}

/**
 * The admins, plus the room's streamer once `find` tells who that is: it's asked at start, and
 * again every `retryMs` until it answers (room-feed reads the room page a little after connecting).
 */
export class StreamerAdmin implements Admins {
  private streamer: { uid: string; nickname: string } | null = null;

  constructor(private readonly options: StreamerAdminOptions) {}

  has(userId: string): boolean {
    return userId === this.streamer?.uid || this.options.admins.has(userId);
  }

  /** The streamer, once found. */
  current(): { uid: string; nickname: string } | null {
    return this.streamer;
  }

  start(): void {
    const {
      find,
      onFound,
      log,
      retryMs = 10_000,
      schedule = (run, ms) => void setTimeout(run, ms),
    } = this.options;
    const ask = () => {
      find()
        .catch((err: unknown) => {
          log.warn('could not find the streamer', { error: errorMessage(err) });
          return null;
        })
        .then((streamer) => {
          if (!streamer) return schedule(ask, retryMs);
          this.streamer = streamer;
          log.info('streamer is an admin', streamer);
          onFound?.(streamer);
        })
        .catch(() => {});
    };
    ask();
  }
}
