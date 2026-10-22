import { appliesTo, type Viewer } from '../../core/commands/additional-command';
import { parseCommand } from '../../core/commands/command';
import type { ChatLine, IncomingChat } from '../../core/chat/room-events';
import type { Heard } from '../../core/prompts/prompt';
import { singingNow } from '../../core/songs/transcript';
import type { Command } from '../commands/command';
import { CommandRunner } from '../commands/command-runner';
import type { EventBus } from '../event-bus';
import type { Mention, MentionAnswerer, UnpromptedReply } from './mention-answerer';
import type { Outbox } from './outbox';
import type { AdditionalCommand, Admins, Log } from '../ports';
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
  room: Pick<RoomState, 'recentChat' | 'replyLimits' | 'recentTranscript'>;
  /** Where notices and command replies go to be sent, spaced out. */
  outbox: Pick<Outbox, 'push'>;
  log: Log;
  /** User ids of the admins: only they can run the admin-only commands. */
  admins?: Admins;
  /** The room's streamer once known, whose fan club a command's `fansLevel` counts. */
  streamer?: () => { uid: string } | null;
  /** What a mention starting with `/` can run. */
  commands?: readonly Command[];
  /**
   * The room's own commands, as they are now (their files are read again as they change):
   * answered with their own prompt when Claude finds a mention asking for one, or auto-reply
   * picks one for what someone said.
   */
  additionalCommands?: () => readonly AdditionalCommand[];
  /** Douyin's chat length limit, for the bot's own messages. */
  maxReplyLength?: number;
  /** Who may run admin-only commands, as viewers know them: 「只有主播和…才可以」. */
  adminNames?: string;
  now?: () => number;
}

/**
 * Decides what each @mention of the bot is: a question, handed to the answerer, or, with a `/`
 * first, one of `commands` (`/截图 1`…), which the CommandRunner runs.
 */
export class ChatBot {
  private readonly runner: CommandRunner;

  constructor(private readonly options: ChatBotOptions) {
    this.runner = new CommandRunner({
      commands: options.commands ?? [],
      outbox: options.outbox,
      room: options.room,
      log: options.log,
      ask: (mention) => this.ask(mention),
      isAdmin: (userId) => this.isAdmin(userId),
      maxReplyLength: options.maxReplyLength,
      adminNames: options.adminNames,
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
    await this.runner.idle();
    await this.options.answerer.idle();
  }

  /**
   * Runs the command the mention gives, or hands the question on: to the room's own command whose
   * trigger it matches, when there is one.
   */
  private onMention(chat: IncomingChat, question: string): void {
    const { log } = this.options;
    const { nickname: asker, userId } = chat;
    log.info('mention', { asker, userId, question });
    const admin = this.isAdmin(userId);
    const call = parseCommand(question);
    if (call) {
      this.runner.run(chat, call, admin);
      return;
    }
    // One that runs a command of the bot's isn't taken by its trigger: run with no answer to fall
    // back on, it waits for Claude to ask for it (requestCommand).
    const taken = (this.options.additionalCommands?.() ?? []).filter(
      ({ trigger, adminOnly, run }) =>
        run === undefined && trigger?.test(question) && (!adminOnly || admin),
    );
    const viewer = this.viewerOf(chat, admin);
    const own = taken.find((command) => this.appliesTo(command, viewer));
    // Taken by commands that aren't for them: nothing is done, not even the usual answer.
    if (!own && taken[0]) {
      this.skipped(taken[0], asker, userId);
      return;
    }
    if (own) log.info('additional command triggered', { asker, userId, command: own.id });
    this.askMention(chat, question, admin, own);
  }

  /**
   * Hands a mention on, with the room's own command `own` if there is one;
   * when that command's answer is empty (it wasn't really for it), asked again as usual.
   */
  private askMention(
    chat: IncomingChat,
    question: string,
    admin: boolean,
    own?: AdditionalCommand,
  ): void {
    const { nickname: asker, userId } = chat;
    this.ask({
      asker,
      userId,
      question,
      history: this.options.room.recentChat(),
      ...(own && this.commandPrompt(own, asker)),
      ...(own &&
        own.fixedReply === undefined && {
          ifEmpty: () => {
            this.options.log.info('not for the command, answering as usual', {
              asker,
              command: own.id,
            });
            this.askMention(chat, question, admin);
          },
        }),
    });
  }

  /**
   * Someone asked, in so many words, for what a command does (Claude found it in their mention, or
   * in what they said to the bot, the streamer on the stream too): it runs as if they'd typed it,
   * but an admin-only one from anyone else is answered that they may not (see
   * CommandRunner.request). One of the room's own commands (主播会唱xxx吗) is asked again with its own
   * prompt. False when there's no such command, so Claude's own reply goes out.
   */
  requestCommand(mention: Mention, name: string, args: string): boolean {
    const { asker, userId } = mention;
    // One of the room's own: answered with its prompt instead.
    const own = this.additionalCommand(name);
    if (own && !this.appliesTo(own, this.viewerFrom(userId, mention.history, 'chat'))) {
      // Claude took it for the command, but it isn't for them: nothing is said.
      this.skipped(own, asker, userId);
      return true;
    }
    if (own?.adminOnly && !this.isAdmin(userId)) {
      // Not theirs to ask for: Claude's own reply goes out instead.
      this.options.log.info('additional command not for them', { asker, userId, command: own.id });
      return false;
    }
    if (own?.run !== undefined) {
      this.runFor(own, { ts: this.now(), userId, nickname: asker, mentions: [] });
      return true;
    }
    if (own) {
      this.options.log.info('additional command requested', { asker, userId, command: own.id });
      this.ask({ ...mention, ...this.commandPrompt(own, asker) });
      return true;
    }
    return this.runner.request(mention, name, args);
  }

  /**
   * Answers what someone said to or about the bot without an @ (auto-reply picked it), like a
   * mention.
   */
  replyUnprompted({ nickname, userId, question, heard, command }: UnpromptedReply): void {
    const ts = (this.options.now ?? Date.now)();
    const chat: IncomingChat = { ts, userId, nickname, content: question, mentions: [] };
    const own = command === undefined ? undefined : this.additionalCommand(command);
    this.options.log.info('unprompted', { asker: nickname, userId, question, heard, command });
    if (own?.adminOnly && !this.isAdmin(userId)) {
      this.options.log.info('additional command not for them', { asker: nickname, command });
      return;
    }
    const viewer = this.viewerFrom(userId, this.options.room.recentChat(), heard);
    if (own && !this.appliesTo(own, viewer)) {
      this.skipped(own, nickname, userId);
      return;
    }
    if (own?.run !== undefined) {
      this.runFor(own, chat);
      return;
    }
    this.ask({
      asker: nickname,
      userId,
      question,
      history: this.options.room.recentChat(),
      unprompted: heard,
      ...(own && this.commandPrompt(own, nickname)),
    });
  }

  /**
   * Runs the command of the bot's that the room's own command `own` runs (its `runWhileSinging`
   * while the streamer is singing, else its `run`), as if `chat`'s sender had typed it: an
   * admin-only one only for an admin.
   */
  private runFor(own: AdditionalCommand, chat: Omit<IncomingChat, 'content'>): void {
    const { room, log } = this.options;
    const singing = singingNow(room.recentTranscript(), this.now());
    const name = (singing && own.runWhileSinging) || own.run;
    if (name === undefined) return;
    const question = `/${name}`;
    log.info('additional command runs', { id: own.id, asker: chat.nickname, run: name, singing });
    this.runner.run({ ...chat, content: question }, { name, args: '' }, this.isAdmin(chat.userId));
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  /**
   * How the room's own command `own` answers `asker`: with its fixed reply, or with its prompt,
   * in JSON.
   */
  private commandPrompt(
    own: AdditionalCommand,
    asker: string,
  ): Pick<Mention, 'template' | 'jsonMessage' | 'atOthers' | 'fixedReply'> {
    if (own.fixedReply !== undefined) {
      this.options.log.info('fixed reply', { id: own.id, asker });
      return { fixedReply: own.fixedReply };
    }
    return { template: own.prompt(), jsonMessage: true, ...(own.atOthers && { atOthers: true }) };
  }

  /** Whether the room's own command `own` applies to `viewer` (its `only` and `except`). */
  private appliesTo(own: AdditionalCommand, viewer: Viewer): boolean {
    return appliesTo(own, viewer, this.options.streamer?.()?.uid);
  }

  private skipped(own: AdditionalCommand, asker: string, userId: string | undefined): void {
    this.options.log.info('skipped by user filter', { id: own.id, asker, userId });
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

  /** The room's own command `name` (its id, or what it's for), if there is one. */
  private additionalCommand(name: string): AdditionalCommand | undefined {
    return this.options
      .additionalCommands?.()
      .find(({ id, name: title }) => [id, title].includes(name));
  }

  private isAdmin(userId: string | undefined): boolean {
    return userId !== undefined && !!this.options.admins?.has(userId);
  }

  /** Hands a mention to the answerer. */
  private ask(mention: Mention): void {
    this.options.answerer.ask(mention);
  }
}
