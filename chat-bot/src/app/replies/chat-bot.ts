import type { Viewer } from '../../core/tools/tool-definition';
import { parseCommand } from '../../core/commands/command';
import type { ChatLine, IncomingChat } from '../../core/chat/room-events';
import type { Heard } from '../../core/prompts/prompt';
import { ToolRunner } from '../tools/tool-runner';
import type { EventBus } from '../event-bus';
import type { Mention, MentionAnswerer, UnpromptedReply } from './mention-answerer';
import type { Outbox } from './outbox';
import type { Admins, Log } from '../ports';
import type { BotTool } from '../../core/tools/bot-tool';
import type { RoomFeed } from '../room/room-feed';
import type { RoomState } from '../room/room-state';

export interface ChatBotOptions {
  /** The thing that listens to the room, to start and stop. */
  feed: Pick<RoomFeed, 'start' | 'stop'>;
  /** Where the mentions come from. */
  bus: Pick<EventBus, 'on'>;
  /** Answers the questions. */
  answerer: Pick<MentionAnswerer, 'ask' | 'idle'>;
  /** The chat before a question goes with it to the answerer. */
  room: Pick<RoomState, 'recentChat' | 'replyLimits'>;
  /** Where command replies go to be sent, spaced out. */
  outbox: Pick<Outbox, 'push'>;
  log: Log;
  /** User ids of the admins: only they can run the admin-only commands. */
  admins?: Admins;
  /** The bot's tools as they are now; those with `commands` run when a mention starts with their `/` name. */
  tools?: () => readonly BotTool[];
  /** Douyin's chat length limit, for the bot's own messages. */
  maxReplyLength?: number;
  /** Who may run admin-only commands, as viewers know them: 「只有主播和…才可以」. */
  adminNames?: string;
  now?: () => number;
  /** Runs the commands; one made from the options above by default. */
  toolRunner?: Pick<ToolRunner, 'run' | 'idle'>;
}

/** Whether `userId` is one of `admins`. */
export function isAdmin(admins: Admins | undefined, userId: string | undefined): boolean {
  return userId !== undefined && !!admins?.has(userId);
}

/**
 * Decides what each @mention of the bot is: a question, handed to the answerer, or, with a `/`
 * first, a tool's command (`/识歌`), which the ToolRunner runs.
 */
export class ChatBot {
  private readonly toolRunner: Pick<ToolRunner, 'run' | 'idle'>;

  constructor(private readonly options: ChatBotOptions) {
    this.toolRunner =
      options.toolRunner ??
      new ToolRunner({
        tools: options.tools ?? (() => []),
        outbox: options.outbox,
        room: options.room,
        log: options.log,
        isAdmin: (userId) => this.isAdmin(userId),
        adminNames: options.adminNames,
        maxReplyLength: options.maxReplyLength,
        now: options.now,
      });
  }

  start(): void {
    this.options.bus.on('mention', ({ chat, question }) => this.onMention(chat, question));
    this.options.feed.start();
  }

  stop(): void {
    this.options.feed.stop();
  }

  /** Resolves once Claude has answered every queued mention, and every command has finished. */
  async idle(): Promise<void> {
    await this.options.answerer.idle();
    await this.toolRunner.idle();
  }

  /** Runs the command the mention gives, or hands the question on to the answerer. */
  private onMention(chat: IncomingChat, question: string): void {
    const { log } = this.options;
    const { nickname: asker, userId } = chat;
    log.info('mention', { asker, userId, question });
    const admin = this.isAdmin(userId);
    const call = parseCommand(question);
    if (call) {
      this.toolRunner.run(chat, call, admin);
      return;
    }
    this.ask({
      asker,
      userId,
      question,
      history: this.options.room.recentChat(),
      viewer: this.viewerOf(chat, admin),
    });
  }

  /**
   * Answers what someone said to or about the bot without an @ (auto-reply picked it), like a
   * mention.
   */
  replyUnprompted({ nickname, userId, question, heard, topics }: UnpromptedReply): void {
    this.options.log.info('unprompted', {
      asker: nickname,
      userId,
      question,
      heard,
      ...(topics?.length && { topics }),
    });
    const history = this.options.room.recentChat();
    this.ask({
      asker: nickname,
      userId,
      question,
      history,
      unprompted: heard,
      ...(topics?.length && { topics }),
      viewer: this.viewerFrom(userId, history, heard),
    });
  }

  /** Who `chat`'s sender is, for a command's user filter. */
  private viewerOf(chat: ChatLine, admin: boolean): Viewer {
    const { badges, fansClub, payLevel } = chat;
    return {
      admin,
      ...(badges && { badges }),
      ...(fansClub && { fansClub }),
      ...(payLevel !== undefined && { payLevel }),
    };
  }

  /**
   * Who `userId` is, from their latest line in `history` (the streamer's speech has none, so
   * only `admin` can match it).
   */
  private viewerFrom(
    userId: string | undefined,
    history: readonly ChatLine[],
    heard: Heard,
  ): Viewer {
    const admin = this.isAdmin(userId);
    const line =
      heard === 'speech' || !userId
        ? undefined
        : [...history].reverse().find((l) => l.userId === userId);
    return line ? this.viewerOf(line, admin) : { admin };
  }

  private isAdmin(userId: string | undefined): boolean {
    return isAdmin(this.options.admins, userId);
  }

  /** Hands a mention to the answerer. */
  private ask(mention: Mention): void {
    this.options.answerer.ask(mention);
  }
}
