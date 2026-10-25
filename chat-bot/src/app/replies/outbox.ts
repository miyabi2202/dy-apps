import type { Log, SendChat } from '../ports';
import { errorMessage } from '../../core/errors';
import { withoutForbidden, type ForbiddenWords } from '../../core/prompts/forbidden';
import { Pending } from '../pending';

/** What a message is, most urgent first: the order waiting messages go out in. */
const KINDS = ['reply', 'system', 'talk'] as const;

/** One message waiting to go out. */
export interface OutgoingMessage {
  text: string;
  /**
   * An answer to a question, a system message like "已处理截图请求", or something the bot says
   * unprompted: in that order when several wait.
   */
  kind: (typeof KINDS)[number];
  /** Called once it's sent. */
  onSent?: () => void;
}

export interface OutboxOptions {
  send: SendChat;
  log: Log;
  /** Told of each message room-feed sent, e.g. to remember what the bot has said. */
  onSent?: (message: OutgoingMessage) => void;
  /**
   * Words Douyin holds back a message for, read each time: swapped for what to write instead
   * before sending. Claude's answers have them swapped already, before they're cut into messages
   * (see ReplyLimits); this catches the rest, like a nickname in an @.
   */
  forbiddenWords?: () => ForbiddenWords;
  /** At least this long between two messages, so the account doesn't look like a spammer. */
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Every message the bot says goes through here: queued, then sent one at a time, at least
 * `intervalMs` apart. Each kind waits in its own queue, in order, and a waiting reply always goes
 * before a waiting system message, which goes before what it says unprompted. Whoever made the
 * message doesn't wait for it to go out.
 */
export class Outbox {
  private readonly queues = {
    reply: [] as OutgoingMessage[],
    system: [] as OutgoingMessage[],
    talk: [] as OutgoingMessage[],
  };
  private sending = false;
  private readonly work = new Pending();
  private lastSentAt = -Infinity;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: OutboxOptions) {
    this.intervalMs = options.intervalMs ?? 10_000;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  push(message: OutgoingMessage): void {
    this.queues[message.kind].push(message);
    this.options.log.debug('queued to send', { ...message, waiting: this.waiting() });
    this.drain();
  }

  /** Resolves once everything queued has been sent (or has failed). */
  idle(): Promise<void> {
    return this.work.idle();
  }

  private drain(): void {
    if (this.sending) return;
    this.sending = true;
    this.work.track(this.sendAll());
  }

  private async sendAll(): Promise<void> {
    try {
      for (let message = this.next(); message; message = this.next()) {
        const wait = this.lastSentAt + this.intervalMs - this.now();
        if (wait > 0) await this.sleep(wait);
        await this.sendOne(message);
        this.lastSentAt = this.now();
      }
    } finally {
      this.sending = false;
    }
  }

  private next(): OutgoingMessage | undefined {
    for (const kind of KINDS) {
      const message = this.queues[kind].shift();
      if (message) return message;
    }
    return undefined;
  }

  private waiting(): number {
    return KINDS.reduce((sum, kind) => sum + this.queues[kind].length, 0);
  }

  /** Sends `message`, with its forbidden words swapped. */
  private async sendOne(message: OutgoingMessage): Promise<void> {
    const { kind } = message;
    const { send, log } = this.options;
    const text = withoutForbidden(message.text, this.options.forbiddenWords?.());
    if (text !== message.text) {
      log.warn(`${kind} had forbidden words, swapped`, { text: message.text, sent: text });
    }
    try {
      const { echoed } = await send(text);
      log.info(`${kind} sent`, { text, echoed, waiting: this.waiting() });
      if (!echoed) log.warn(`${kind} did not show up in the room chat`, { text });
      this.options.onSent?.({ ...message, text });
      message.onSent?.();
    } catch (err) {
      log.error(`could not send ${kind}`, {
        text,
        error: errorMessage(err),
      });
    }
  }
}
