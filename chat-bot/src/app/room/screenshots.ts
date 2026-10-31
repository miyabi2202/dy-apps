import { errorMessage } from '../../core/errors';
import type { Log, Screenshot, SettingsStore } from '../ports';

export interface ScreenshotsOptions {
  /** A JPEG of the live video; without it there is never one. */
  fetch?: Screenshot;
  /** The room's settings, where `screenshots` says whether prompts get the video (`/截图`). */
  settings: Pick<SettingsStore, 'get'>;
  log: Log;
}

/** The live video for a prompt, while screenshots are on. */
export class Screenshots {
  constructor(private readonly options: ScreenshotsOptions) {}

  /**
   * The live video while screenshots are on, or `always`; nothing while they're off (without
   * asking room-feed) or when there's no screenshot to be had: prompting goes on.
   */
  async take(always = false): Promise<Uint8Array | undefined> {
    if (!this.options.settings.get().screenshots && !always) return undefined;
    try {
      return await this.options.fetch?.();
    } catch (err) {
      this.options.log.warn('no screenshot', { error: errorMessage(err) });
      return undefined;
    }
  }
}
