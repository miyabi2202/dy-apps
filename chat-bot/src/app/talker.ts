import { errorMessage } from '../core/errors';
import { buildPrompt } from '../core/prompt';
import { DOUYIN_CHAT_LIMIT, plainMessage } from '../core/reply';
import { done, failed, type Command } from './command';
import type { OutgoingMessage, Outbox } from './outbox';
import type { AskClaude, Log } from './ports';
import type { RoomState } from './room-state';

export interface TalkerOptions {
  ask: AskClaude;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (see buildPrompt for what it can fill in), read each time so edits apply at once. */
  promptTemplate: () => string;
  /** Say something this often; 0 never, until changed. */
  intervalMs: number;
  /** The chat, transcript and the rest of what the prompt knows about the room. */
  room: RoomState;
  /** Douyin's chat length limit. */
  maxLength?: number;
  log: Log;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Has Claude say something to the streamer unprompted, as fits what's going on: from what the
 * streamer said and sang and the chat lately, and the video when there's a screenshot. It does
 * so every `intervalMs` (which can be changed while it runs, 0 for never), staying quiet when
 * nothing was said, or chatted by anyone but the bot, since the last time, since the stream is
 * then likely off; and whenever `talkNow` asks. Scheduled messages go out after everything else
 * waiting.
 */
export class Talker {
  private stopped = false;
  private intervalMs: number;
  /** Ends the current wait early, when the interval changes or the talker stops. */
  private wake: () => void = () => {};
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: TalkerOptions) {
    this.intervalMs = options.intervalMs;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Runs until `stop()`. */
  async run(): Promise<void> {
    while (!this.stopped) {
      const intervalMs = this.intervalMs;
      if ((await this.wait(intervalMs)) === 'woken' || this.stopped) continue;
      await this.talk(intervalMs);
    }
  }

  stop(): void {
    this.stopped = true;
    this.wake();
  }

  /** How often it talks, in ms; 0 never. */
  get interval(): number {
    return this.intervalMs;
  }

  /** Talk this often from now on (0 never), counting from now. */
  set interval(ms: number) {
    this.intervalMs = ms;
    this.options.log.info('talk interval', { minutes: ms / 60_000 });
    this.wake();
  }

  /** Says something now, whatever's going on, sent as `kind`; what it said, or null if nothing. */
  async talkNow(kind: OutgoingMessage['kind'] = 'reply'): Promise<string | null> {
    return this.say(kind);
  }

  /** `/回复` talks now, `/自动回复间隔 5` talks every 5 minutes from now on (0 never). */
  commands(): Command[] {
    return [
      {
        name: '回复',
        adminOnly: true,
        price: 0,
        run: async () =>
          // The message itself says it worked.
          (await this.talkNow()) ? done('') : failed('没想好说什么，这次没有回复'),
      },
      {
        name: '自动回复间隔',
        adminOnly: true,
        price: 0,
        run: (args) => {
          if (!/^\d+$/.test(args))
            return failed('间隔要写成分钟数，0 表示关闭，用法：/自动回复间隔 3');
          this.interval = Number(args) * 60_000;
          return done('已处理自动回复间隔请求');
        },
      },
    ];
  }

  /** Waits `ms` (forever when 0), or until woken: which of the two ended it. */
  private wait(ms: number): Promise<'elapsed' | 'woken'> {
    return new Promise((resolve) => {
      this.wake = () => resolve('woken');
      if (ms > 0) void this.sleep(ms).then(() => resolve('elapsed'));
    });
  }

  /** The scheduled talk, unless the room has been quiet for `intervalMs`. */
  private async talk(intervalMs: number): Promise<void> {
    const { room } = this.options;
    const since = room.now() - intervalMs;
    if (
      !room.recentTranscript().some((line) => line.end > since) &&
      !room.recentChat().some((chat) => chat.ts > since && chat.nickname !== room.botName)
    ) {
      this.options.log.info('room quiet, not talking');
      return;
    }
    await this.say('talk');
  }

  private async say(kind: OutgoingMessage['kind']): Promise<string | null> {
    const { ask, outbox, room, log, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    try {
      const prompt = buildPrompt(this.options.promptTemplate(), {
        ...room.promptInput(),
        singleLength: maxLength,
        maxLength,
      });
      log.debug('talk prompt', { prompt });
      const image = await room.screenshot();
      const text = plainMessage(await ask({ prompt, image }), maxLength);
      if (!text) {
        log.warn('claude had nothing to say');
        return null;
      }
      log.info('talking', { text, kind });
      outbox.push({ kind, text });
      return text;
    } catch (err) {
      log.error('could not talk', { error: errorMessage(err) });
      return null;
    }
  }
}
