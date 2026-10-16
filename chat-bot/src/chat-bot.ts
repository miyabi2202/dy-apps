import type { DyhubClient } from '@dy-apps/services';
import { ChatHistory, chatLineFrom, type ChatLine } from './chat-history';
import type { AskClaude } from './claude';
import type { SendChat } from './dyhub-chat';
import { isFromBot, questionFor, type BotIdentity } from './mention';
import { buildPrompt } from './prompt';

/** The logger methods the bot uses; a winston logger fits. */
export interface BotLog {
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

export interface ChatBotOptions {
  client: Pick<DyhubClient, 'onComment' | 'onStatus' | 'connect' | 'close'>;
  bot: BotIdentity;
  ask: AskClaude;
  send: SendChat;
  log: BotLog;
  /** The prompt, with `{{history}}`, `{{asker}}` and `{{question}}` to fill in. */
  promptTemplate: string;
  /** How many recent chats to remember and pass to Claude. */
  historySize?: number;
  /** Longer replies are cut to this many characters. */
  maxReplyLength?: number;
  /** Mentions waiting beyond this are dropped, so a busy room can't pile up a backlog. */
  maxPending?: number;
}

interface Mention {
  asker: string;
  question: string;
  history: ChatLine[];
}

/**
 * Remembers a room's recent chat and answers each @mention of the bot: the question and the
 * chat before it go to Claude, and the answer goes back to the room through DyHub. Mentions are
 * answered one at a time, in order.
 */
export class ChatBot {
  private readonly history: ChatHistory;
  private readonly pending: Mention[] = [];
  private busy = false;
  private readonly maxReplyLength: number;
  private readonly maxPending: number;

  constructor(private readonly options: ChatBotOptions) {
    this.history = new ChatHistory(options.historySize ?? 100);
    this.maxReplyLength = options.maxReplyLength ?? 50;
    this.maxPending = options.maxPending ?? 5;
  }

  start(): void {
    const { client, log } = this.options;
    client.onStatus((status, detail) => log.info(`dyhub ${status}`, detail ? { detail } : {}));
    client.onComment((event) => {
      const line = chatLineFrom(event);
      log.debug('chat', { ...line });
      const { bot } = this.options;
      const question = isFromBot(event, bot) ? null : questionFor(event, bot);
      if (question !== null)
        this.enqueue({ asker: line.nickname, question, history: this.history.recent() });
      this.history.add(line);
    });
    client.connect();
  }

  stop(): void {
    this.options.client.close();
  }

  /** Resolves once every queued mention has been answered (or has failed). */
  async idle(): Promise<void> {
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  private enqueue(mention: Mention): void {
    const { log } = this.options;
    if (this.pending.length >= this.maxPending) {
      log.warn('too many mentions waiting, dropping one', {
        asker: mention.asker,
        question: mention.question,
      });
      return;
    }
    log.info('mention', { asker: mention.asker, question: mention.question });
    this.pending.push(mention);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let mention = this.pending.shift(); mention; mention = this.pending.shift()) {
        await this.answer(mention);
      }
    } finally {
      this.busy = false;
    }
  }

  private async answer(mention: Mention): Promise<void> {
    const { ask, send, log, promptTemplate } = this.options;
    const prompt = buildPrompt(promptTemplate, mention);
    log.debug('prompt', { prompt });
    try {
      const started = Date.now();
      const answer = await ask(prompt);
      log.info('claude answered', { answer, ms: Date.now() - started });
      const reply = this.toReply(mention.asker, answer);
      if (!reply) {
        log.warn('claude gave an empty answer', { asker: mention.asker });
        return;
      }
      const { echoed } = await send(reply);
      log.info('reply sent', { reply, echoed });
      if (!echoed) log.warn('reply did not show up in the room chat', { reply });
    } catch (err) {
      log.error('could not answer mention', {
        asker: mention.asker,
        question: mention.question,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** `@asker answer` on one line, cut to the length limit; empty when Claude said nothing. */
  private toReply(asker: string, answer: string): string {
    const text = answer.replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return [...`@${asker} ${text}`].slice(0, this.maxReplyLength).join('');
  }
}
