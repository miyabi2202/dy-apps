import type { Log, SendChat } from './ports';

/** What a message is, most urgent first: the order waiting messages go out in. */
const KINDS = ['reply', 'system', 'notice', 'talk'] as const;

/** One message waiting to go out. */
export interface OutgoingMessage {
  text: string;
  /**
   * An answer to a question, a system message like "已处理修改人设请求", a notice like "balance
   * too low", or something the bot says unprompted: in that order when several wait.
   */
  kind: (typeof KINDS)[number];
  /** Called when DyHub couldn't send it, e.g. to refund the question it answers. */
  onFailed?: () => void;
}

export interface OutboxOptions {
  send: SendChat;
  log: Log;
  /** Told of each message DyHub sent, e.g. to remember what the bot has said. */
  onSent?: (message: OutgoingMessage) => void;
  /** At least this long between two messages, so the account doesn't look like a spammer. */
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Every message the bot says goes through here: queued, then sent one at a time, at least
 * `intervalMs` apart. Each kind waits in its own queue, in order, and a waiting reply always goes
 * before a waiting system message, which goes before a waiting notice. Whoever made the message
 * doesn't wait for it to go out.
 */
export class Outbox {
  private readonly queues = {
    reply: [] as OutgoingMessage[],
    system: [] as OutgoingMessage[],
    notice: [] as OutgoingMessage[],
    talk: [] as OutgoingMessage[],
  };
  private sending = false;
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
    void this.drain();
  }

  /** Resolves once everything queued has been sent (or has failed). */
  async idle(): Promise<void> {
    while (this.sending) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  private async drain(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
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

  private async sendOne(message: OutgoingMessage): Promise<void> {
    const { text, kind, onFailed } = message;
    const { send, log } = this.options;
    try {
      const { echoed } = await send(text);
      log.info(`${kind} sent`, { text, echoed, waiting: this.waiting() });
      if (!echoed) log.warn(`${kind} did not show up in the room chat`, { text });
      this.options.onSent?.(message);
    } catch (err) {
      log.error(`could not send ${kind}`, {
        text,
        error: err instanceof Error ? err.message : String(err),
      });
      onFailed?.();
    }
  }
}
