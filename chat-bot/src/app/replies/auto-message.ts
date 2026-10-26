import type { Log, SettingsStore } from '../ports';
import type { Outbox } from './outbox';
import { setting } from '../commands/setting';

export interface AutoMessageOptions {
  /** The room's `auto_message` as it is now (room_config.json, read again as it changes); none when absent. */
  message: () => string | undefined;
  /** Where the interval is kept (the room's room_config.json); without it, `intervalSeconds` is. */
  settings?: SettingsStore;
  /** Seconds between two messages, 0 off; what it starts as without `settings`. */
  intervalSeconds?: number;
  outbox: Pick<Outbox, 'push'>;
  log: Log;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** How often it looks whether it's time, so a change to the interval or the message applies soon. */
  tickMs?: number;
}

/**
 * Says the room's `auto_message` every `autoMessageIntervalSeconds` (`/自动消息间隔`), as it is;
 * off when the interval is 0 or there's no message. The first one goes out one interval after it's
 * turned on (or the bot starts with it on), not at once.
 */
export class AutoMessage {
  private readonly intervalSetting: ReturnType<typeof setting<'autoMessageIntervalSeconds'>>;
  private stopped = false;
  /** When it last said the message, or was turned on; undefined while off. */
  private since: number | undefined;

  constructor(private readonly options: AutoMessageOptions) {
    this.intervalSetting = setting(
      options.settings,
      'autoMessageIntervalSeconds',
      options.intervalSeconds ?? 0,
    );
  }

  /** Seconds between two messages; 0 off. */
  get intervalSeconds(): number {
    return this.intervalSetting.get();
  }

  set intervalSeconds(seconds: number) {
    this.intervalSetting.set(seconds);
  }

  /** Runs until `stop()`. */
  async run(): Promise<void> {
    const { sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), tickMs = 1000 } =
      this.options;
    while (!this.stopped) {
      this.tick();
      await sleep(tickMs);
    }
  }

  stop(): void {
    this.stopped = true;
  }

  /** Sends the message if it's time. */
  tick(): void {
    const { outbox, log, now = Date.now } = this.options;
    const seconds = this.intervalSeconds;
    const text = this.options.message()?.trim();
    if (!seconds || !text) {
      this.since = undefined;
      return;
    }
    const at = now();
    if (this.since === undefined) {
      this.since = at;
      return;
    }
    if (at - this.since < seconds * 1000) return;
    this.since = at;
    log.info('auto message', { text });
    outbox.push({ kind: 'talk', text });
  }
}
