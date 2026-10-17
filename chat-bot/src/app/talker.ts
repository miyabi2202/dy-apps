import { buildPrompt } from '../core/prompt';
import { plainMessage } from '../core/reply';
import type { ChatLine } from '../core/room-events';
import type { Transcript } from '../core/transcript';
import type { Persona } from './commands';
import type { OutgoingMessage, Outbox } from './outbox';
import type { AskClaude, BotTalk, Log, Screenshot } from './ports';

export interface TalkerOptions {
  ask: AskClaude;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (see buildPrompt for what it can fill in), read each time so edits apply at once. */
  promptTemplate: () => string;
  /** Say something this often; 0 never, until changed. */
  intervalMs: number;
  /** The room's recent chat, oldest first. */
  recentChat: () => ChatLine[];
  transcript?: Transcript;
  /** How far back `{{transcript}}` goes. */
  transcriptMs?: number;
  screenshot?: Screenshot;
  persona?: Persona;
  /** Background on the room for `{{context}}`, read each time. */
  context?: () => string;
  /** What the bot has said in the room, for `{{botTalk}}`. */
  botTalk?: Pick<BotTalk, 'recent'>;
  /** The bot's own nickname: its messages in the chat don't count as anyone chatting. */
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
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: TalkerOptions) {
    this.intervalMs = options.intervalMs;
    this.now = options.now ?? Date.now;
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

  /** Waits `ms` (forever when 0), or until woken: which of the two ended it. */
  private wait(ms: number): Promise<'elapsed' | 'woken'> {
    return new Promise((resolve) => {
      this.wake = () => resolve('woken');
      if (ms > 0) void this.sleep(ms).then(() => resolve('elapsed'));
    });
  }

  /** The scheduled talk, unless the room has been quiet for `intervalMs`. */
  private async talk(intervalMs: number): Promise<void> {
    const since = this.now() - intervalMs;
    const transcript = this.recentTranscript();
    const { botName } = this.options;
    if (
      !transcript.some((line) => line.end > since) &&
      !this.options.recentChat().some((chat) => chat.ts > since && chat.nickname !== botName)
    ) {
      this.options.log.info('room quiet, not talking');
      return;
    }
    await this.say('talk');
  }

  private recentTranscript() {
    return this.options.transcript?.recent(this.options.transcriptMs ?? 5 * 60_000) ?? [];
  }

  private async say(kind: OutgoingMessage['kind']): Promise<string | null> {
    const { ask, outbox, log, maxLength = 49 } = this.options;
    try {
      const prompt = buildPrompt(this.options.promptTemplate(), {
        history: this.options.recentChat(),
        transcript: this.recentTranscript(),
        asker: '',
        question: '',
        singleLength: maxLength,
        maxLength,
        now: this.now(),
        chatDir: this.options.chatDir,
        persona: this.options.persona?.value,
        context: this.options.context?.(),
        botTalk: this.options.botTalk?.recent(),
        botName: this.options.botName,
      });
      log.debug('talk prompt', { prompt });
      const image = await this.screenshot();
      const text = plainMessage(await ask({ prompt, image }), maxLength);
      if (!text) {
        log.warn('claude had nothing to say');
        return null;
      }
      log.info('talking', { text, kind });
      outbox.push({ kind, text });
      return text;
    } catch (err) {
      log.error('could not talk', { error: err instanceof Error ? err.message : String(err) });
      return null;
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
