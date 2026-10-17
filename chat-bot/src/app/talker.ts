import { buildPrompt } from '../core/prompt';
import { plainMessage } from '../core/reply';
import type { ChatLine } from '../core/room-events';
import type { Transcript } from '../core/transcript';
import type { Persona } from './commands';
import type { Outbox } from './outbox';
import type { AskClaude, Log, Screenshot } from './ports';

export interface TalkerOptions {
  ask: AskClaude;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt; see buildPrompt for what it can fill in. */
  promptTemplate: string;
  /** Say something this often. */
  intervalMs: number;
  /** The room's recent chat, oldest first. */
  recentChat: () => ChatLine[];
  transcript?: Transcript;
  /** How far back `{{transcript}}` goes. */
  transcriptMs?: number;
  screenshot?: Screenshot;
  persona?: Persona;
  botName: string;
  chatDir?: string;
  /** Douyin's chat length limit. */
  maxLength?: number;
  log: Log;
  now?: () => number;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Every `intervalMs`, has Claude say something to the streamer unprompted, as fits what's going
 * on: from what the streamer said and sang and the chat lately, and the video when there's a
 * screenshot. It stays quiet when nothing was said or chatted since the last time, since the
 * stream is then likely off. Its messages go out after everything else waiting.
 */
export class Talker {
  private stopped = false;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: TalkerOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Runs until `stop()`. */
  async run(): Promise<void> {
    while (!this.stopped) {
      await this.sleep(this.options.intervalMs);
      if (this.stopped) break;
      await this.talk();
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private async talk(): Promise<void> {
    const { ask, outbox, log, intervalMs, maxLength = 49 } = this.options;
    const now = this.now();
    const transcript =
      this.options.transcript?.recent(this.options.transcriptMs ?? 5 * 60_000) ?? [];
    const history = this.options.recentChat();
    const since = now - intervalMs;
    if (!transcript.some((line) => line.end > since) && !history.some((chat) => chat.ts > since)) {
      log.info('room quiet, not talking');
      return;
    }
    const prompt = buildPrompt(this.options.promptTemplate, {
      history,
      transcript,
      asker: '',
      question: '',
      singleLength: maxLength,
      maxLength,
      now,
      chatDir: this.options.chatDir,
      persona: this.options.persona?.value,
      botName: this.options.botName,
    });
    log.debug('talk prompt', { prompt });
    try {
      const image = await this.screenshot();
      const text = plainMessage(await ask({ prompt, image }), maxLength);
      if (!text) {
        log.warn('claude had nothing to say');
        return;
      }
      log.info('talking', { text });
      outbox.push({ kind: 'talk', text });
    } catch (err) {
      log.error('could not talk', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** The live video, or nothing when there's no screenshot to be had. */
  private async screenshot(): Promise<Uint8Array | undefined> {
    try {
      return await this.options.screenshot?.();
    } catch (err) {
      this.options.log.warn('no screenshot', {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }
}
