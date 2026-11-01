import { errorMessage } from '../../core/errors';
import type { Log, Screenshot } from '../ports';

export interface ScreenshotsOptions {
  /** A JPEG of the live video. */
  fetch: Screenshot;
  log: Log;
}

/** The live video, for a tool that looks at it (look_at_screen, ask_about_puzzle). */
export class Screenshots {
  constructor(private readonly options: ScreenshotsOptions) {}

  /** The live video now, or nothing when there's no screenshot to be had: the tool goes on without. */
  async take(): Promise<Uint8Array | undefined> {
    try {
      return await this.options.fetch();
    } catch (err) {
      this.options.log.warn('no screenshot', { error: errorMessage(err) });
      return undefined;
    }
  }
}
