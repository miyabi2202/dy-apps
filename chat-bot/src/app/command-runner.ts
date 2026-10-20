import type { CommandCall } from '../core/command';
import { errorMessage } from '../core/errors';
import type { Heard } from '../core/prompt';
import { DOUYIN_CHAT_LIMIT, oneMessage } from '../core/reply';
import type { IncomingChat } from '../core/room-events';
import type { Charge } from './billing';
import type { Command, CommandResult } from './command';
import type { Mention } from './mention-answerer';
import type { Outbox } from './outbox';
import { Pending } from './pending';
import type { AdditionalCommand, Log } from './ports';
import type { RoomState } from './room-state';

/** What it takes to charge for a mention, or for a command. */
export interface ChargeRequest {
  chat: IncomingChat;
  question: string;
  admin: boolean;
  /** The command being run, at its price. */
  command?: Command;
  /** For what the bot would say to the asker unprompted, rather than an @. */
  unprompted?: Heard;
  /** The room's own command, at its price. */
  additional?: AdditionalCommand;
}

export interface CommandRunnerOptions {
  /** What a mention starting with `/` can run. */
  commands: readonly Command[];
  /** Where command replies go to be sent, spaced out. */
  outbox: Pick<Outbox, 'push'>;
  /** The chat before a command's own prompt goes with it to the answerer. */
  room: Pick<RoomState, 'recentChat'>;
  log: Log;
  /** Takes a command's price from the asker (ChatBot.charge): not ok when they can't pay. */
  charge: (request: ChargeRequest) => Charge;
  /** Hands a command's own prompt to the answerer, like a mention. */
  ask: (mention: Mention) => void;
  /** Gives the price of a command back. */
  refund: (mention: Pick<Mention, 'asker' | 'userId' | 'paid'>) => void;
  isAdmin: (userId: string | undefined) => boolean;
  /** Douyin's chat length limit, for the bot's own messages. */
  maxReplyLength?: number;
  /** Who may run admin-only commands, as viewers know them: 「只有主播和…才可以」. */
  adminNames?: string;
  now?: () => number;
}

/**
 * Runs the commands a mention can give (`/修改人设 …`), once they're paid for, and tells the
 * asker how each went in a system message. Admin-only commands, and commands nobody has, are
 * ignored from anyone but an admin, who's told what there is. A command with its own prompt is
 * handed to the answerer like a mention. Also says things to an asker, `@asker text`.
 */
export class CommandRunner {
  /** Commands still running, like one waiting for Claude. */
  private readonly work = new Pending();
  private readonly commands: ReadonlyMap<string, Command>;
  private readonly maxLength: number;

  constructor(private readonly options: CommandRunnerOptions) {
    this.commands = new Map(options.commands.map((command) => [command.name, command]));
    this.maxLength = options.maxReplyLength ?? DOUYIN_CHAT_LIMIT;
  }

  /** Resolves once every command has finished. */
  idle(): Promise<void> {
    return this.work.idle();
  }

  /**
   * Runs the command `call` of `chat`'s mention if the asker may use it (`admin`), once they've paid
   * for it; a call to one they may not use is ignored, or, when they have commands, answered with
   * those.
   */
  run(chat: IncomingChat, question: string, call: CommandCall, admin: boolean): void {
    const pending = this.start(chat, question, call, admin);
    if (pending) this.work.track(pending);
  }

  /**
   * Someone asked, in so many words, for what the admin-only command `name` does: an admin's runs
   * as if they'd typed it, and anyone else is told they may not. False for anything else.
   */
  request(
    { asker, userId }: Pick<Mention, 'asker' | 'userId'>,
    name: string,
    args: string,
  ): boolean {
    const command = this.commands.get(name);
    if (!command?.adminOnly) return false;
    const { log, adminNames = '机器人管理员' } = this.options;
    const admin = this.options.isAdmin(userId);
    log.info('command requested', { asker, userId, name, args, admin });
    if (!admin) {
      this.say(asker, 'system', `你无权调用「${name}」指令，只有主播和${adminNames}才可以`);
      return true;
    }
    const question = `/${name}${args ? ` ${args}` : ''}`;
    const ts = (this.options.now ?? Date.now)();
    const chat: IncomingChat = { ts, userId, nickname: asker, content: question, mentions: [] };
    this.run(chat, question, { name, args }, true);
    return true;
  }

  /** Queues `@asker text` to be sent. */
  say(asker: string, kind: 'system' | 'notice', text: string): void {
    this.options.outbox.push({
      kind,
      text: oneMessage(asker, text, this.maxLength) ?? `@${asker} ${text}`,
    });
  }

  /**
   * Starts the command; a promise while one that waits (on Claude, say) is still running.
   */
  private start(
    chat: IncomingChat,
    question: string,
    { name, args }: CommandCall,
    admin: boolean,
  ): Promise<void> | undefined {
    const { log, charge, refund, ask, room } = this.options;
    const { nickname: asker, userId } = chat;
    const command = this.commands.get(name);
    if (!command || (command.adminOnly && !admin)) {
      const usable = [...this.commands.values()].filter((c) => admin || !c.adminOnly);
      log.info('no such command for them', { asker, userId, name, admin });
      if (usable.length) {
        const names = usable.map((c) => c.name).join('、');
        this.say(asker, 'system', `没有指令「${name}」，可用的有：${names}`);
      }
      return;
    }
    const charged = charge({ chat, question, admin, command });
    if (!charged.ok) return undefined;
    if (command.prompt) {
      log.info('command', { asker, userId, name, args, paid: charged.paid });
      ask({
        asker,
        userId,
        paid: charged.paid,
        question: args,
        history: room.recentChat(),
        template: command.prompt(),
        tools: command.tools,
        maxTurns: command.maxTurns,
        ask: command.ask,
        pickTranscript: command.pickTranscript,
        alwaysScreenshot: command.alwaysScreenshot,
        jsonMessage: command.jsonMessage,
        atOthers: command.atOthers,
      });
      return undefined;
    }
    const failed = (err: unknown): CommandResult => {
      log.error('command failed', { name, error: errorMessage(err) });
      return { ok: false, reply: `指令「${name}」出错了，没有完成` };
    };
    const finish = (result: CommandResult) => {
      log.info('command', { asker, userId, name, args, ...result, paid: charged.paid });
      if (!result.ok && userId) refund({ asker, userId, paid: charged.paid });
      if (result.reply) this.say(asker, 'system', result.reply);
    };
    let result: CommandResult | Promise<CommandResult>;
    try {
      result = command.run(args);
    } catch (err) {
      result = failed(err);
    }
    // A command that answers at once is done at once, so its refund and reply keep their order.
    if (!(result instanceof Promise)) {
      finish(result);
      return undefined;
    }
    return result.catch(failed).then(finish);
  }
}
