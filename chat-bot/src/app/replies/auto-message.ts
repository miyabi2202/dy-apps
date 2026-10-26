import { errorMessage } from '../../core/errors';
import { parseJsonObject } from '../../core/replies/json-answer';
import { DOUYIN_CHAT_LIMIT, plainMessages } from '../../core/replies/reply';
import { setting } from '../commands/setting';
import { askJson } from '../models/ask-json';
import { ModelFeature } from '../models/model-feature';
import type { AskModel, Log, SettingsStore } from '../ports';
import type { RoomState } from '../room/room-state';
import type { Outbox } from './outbox';

export interface AutoMessageOptions {
  /** Claude. */
  ask: AskModel;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (auto-message.md), read each time so edits apply at once. */
  promptTemplate: () => string;
  room: RoomState;
  log: Log;
  /** Where the interval is kept (the room's room_config.json); without it, `intervalSeconds` is. */
  settings?: SettingsStore;
  /** Seconds between two messages, 0 off; what it starts as without `settings`. */
  intervalSeconds?: number;
  /** Douyin's chat length limit. */
  maxLength?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** How often it looks whether it's time, so a change to the interval applies soon. */
  tickMs?: number;
}

/** What Claude says: one message, or '' for nothing. */
interface AutoMessageAnswer {
  message: string;
}

const AUTO_MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string', description: '要发到直播间的弹幕；不发就是空字符串' },
  },
  required: ['message'],
  additionalProperties: false,
} as const;

function parseAutoMessage(text: string): AutoMessageAnswer | null {
  const message = parseJsonObject(text)?.message;
  return typeof message === 'string' ? { message } : null;
}

/**
 * Every `autoMessageIntervalSeconds` (`/自动消息间隔`; 0 off), has Claude read the room (what the
 * streamer said, the chat, what the bot said lately) and say something to it unprompted, in the
 * room's persona, or nothing. The first one is asked one interval after it's turned on (or the
 * bot starts with it on), and it never asks again while Claude is still answering.
 */
export class AutoMessage extends ModelFeature<void, AutoMessageAnswer> {
  private readonly intervalSetting: ReturnType<typeof setting<'autoMessageIntervalSeconds'>>;
  private stopped = false;
  /** When it last asked, or was turned on; undefined while off. */
  private since: number | undefined;
  private asking = false;

  constructor(private readonly options: AutoMessageOptions) {
    super(options.log);
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
  async loop(): Promise<void> {
    const { sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), tickMs = 1000 } =
      this.options;
    while (!this.stopped) {
      void this.tick();
      await sleep(tickMs);
    }
  }

  stop(): void {
    this.stopped = true;
  }

  /** Asks Claude if it's time; resolves once it has answered (at once when it isn't time). */
  async tick(): Promise<void> {
    const { now = Date.now } = this.options;
    const seconds = this.intervalSeconds;
    if (!seconds) {
      this.since = undefined;
      return;
    }
    const at = now();
    if (this.since === undefined) {
      this.since = at;
      return;
    }
    if (this.asking || at - this.since < seconds * 1000) return;
    this.since = at;
    this.asking = true;
    try {
      await this.run();
    } finally {
      // Counted from when Claude answered, so a slow answer doesn't make the next one come at once.
      this.since = now();
      this.asking = false;
    }
  }

  protected buildPrompt(): string {
    const { room, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    return room.prompt(this.options.promptTemplate(), { singleLength: maxLength, maxLength });
  }

  protected async ask(_: void, prompt: string): Promise<AutoMessageAnswer | undefined> {
    const { value } = await askJson(
      this.options.ask,
      { prompt },
      {
        schema: AUTO_MESSAGE_SCHEMA,
        parse: parseAutoMessage,
        notJson: 'auto message answer is not json',
      },
      this.options.log,
    );
    return value ?? undefined;
  }

  protected deliver(_: void, { message }: AutoMessageAnswer): void {
    const { outbox, log, room, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    if (!message.trim()) {
      log.info('auto message: nothing to say');
      return;
    }
    log.info('auto message', { text: message });
    // One message: what doesn't fit is cut, not sent as more.
    for (const text of plainMessages(message, { ...room.replyLimits(maxLength), maxParts: 1 })) {
      outbox.push({ kind: 'talk', text });
    }
  }

  protected failed(_: void, err: unknown): void {
    this.options.log.warn('could not make an auto message', { error: errorMessage(err) });
  }
}
