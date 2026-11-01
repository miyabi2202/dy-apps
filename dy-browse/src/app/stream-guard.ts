import { DEFAULT_PORT } from '@dy-apps/room-feed-protocol';
import { StreamRunningError, StreamStartedError } from '../core/errors';

/** room-feed's port and the live speech service's: either listening means a stream is on. */
export const STREAM_PORTS = [DEFAULT_PORT, 8758] as const;

/**
 * Browsing never runs during a stream. Checked before the run starts and again before every
 * tier-1 job. Whether a port listens is injected, so tests can fake it.
 */
export class StreamGuard {
  constructor(
    private readonly isListening: (port: number) => Promise<boolean>,
    private readonly ports: readonly number[] = STREAM_PORTS,
  ) {}

  /** The first port that listens, or null. */
  async busyPort(): Promise<number | null> {
    for (const port of this.ports) if (await this.isListening(port)) return port;
    return null;
  }

  /** Before the run: refuses when a stream is on. */
  async assertNoStream(): Promise<void> {
    const port = await this.busyPort();
    if (port !== null) throw new StreamRunningError(port);
  }

  /** During the run: a stream that started ends it, cleanly. */
  async assertStillQuiet(): Promise<void> {
    const port = await this.busyPort();
    if (port !== null) throw new StreamStartedError(port);
  }
}
