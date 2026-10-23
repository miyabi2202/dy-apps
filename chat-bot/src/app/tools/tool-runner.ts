import type { CommandCall } from '../../core/commands/command';
import type { IncomingChat } from '../../core/chat/room-events';
import { errorMessage } from '../../core/errors';
import { DOUYIN_CHAT_LIMIT, replyMessages } from '../../core/replies/reply';
import type { BotTool, ToolCommand, ToolResult } from '../../mcp/rpc';
import type { Outbox } from '../replies/outbox';
import { Pending } from '../pending';
import type { Log } from '../ports';
import type { RoomState } from '../room/room-state';

export interface ToolRunnerOptions {
  /** The bot's tools as they are now; those with `commands` can be typed as `/name`. */
  tools: () => readonly BotTool[];
  /** Where the replies go to be sent, spaced out. */
  outbox: Pick<Outbox, 'push'>;
  room: Pick<RoomState, 'replyLimits' | 'atNameOf'>;
  log: Log;
  isAdmin: (userId: string | undefined) => boolean;
  /** Who may run admin-only tools, as viewers know them: 「只有主播和…才可以」 (config.json's `adminNames`). */
  adminNames?: string;
  /** Douyin's chat length limit, for the bot's own messages. */
  maxReplyLength?: number;
  now?: () => number;
}

/**
 * Runs the tool a mention names with a `/` (`/截图 1`…), with no model, and tells the asker how
 * it went in a system message. A name nobody has is answered with the tools they may use, when
 * they have any; an admin-only tool from anyone but an admin, that only the streamer and the
 * admins may.
 */
export class ToolRunner {
  /** Tools still running, like one waiting for Codex. */
  private readonly work = new Pending();
  private readonly maxLength: number;

  constructor(private readonly options: ToolRunnerOptions) {
    this.maxLength = options.maxReplyLength ?? DOUYIN_CHAT_LIMIT;
  }

  /**
   * Runs the tool `call` of `chat`'s mention names if the asker may use it (`admin`); one they
   * may not is refused, and a name nobody has is answered with the names they may use.
   */
  run(chat: IncomingChat, call: CommandCall, admin: boolean): void {
    const pending = this.start(chat, call, admin);
    if (pending) this.work.track(pending);
  }

  /** Resolves once every tool called has finished. */
  idle(): Promise<void> {
    return this.work.idle();
  }

  /** Queues `@asker text` to be sent, split like an answer when it's long (`asker` as it's @ed, see RoomState.atNameOf). */
  say(asker: string, text: string): void {
    const { outbox, room } = this.options;
    for (const message of replyMessages(asker, text, room.replyLimits(this.maxLength))) {
      outbox.push({ kind: 'system', text: message });
    }
  }

  private find(name: string): { tool: BotTool; command: ToolCommand } | undefined {
    return this.options
      .tools()
      .flatMap((tool) => (tool.commands ?? []).map((command) => ({ tool, command })))
      .find(({ command }) => command.name === name);
  }

  /** Starts the tool; a promise while it is still running. */
  private start(
    chat: IncomingChat,
    { name, args }: CommandCall,
    admin: boolean,
  ): Promise<void> | undefined {
    const { log, adminNames = '机器人管理员' } = this.options;
    const { nickname: asker, userId } = chat;
    const at = this.options.room.atNameOf(userId, asker);
    const found = this.find(name);
    if (!found) {
      log.info('no such command for them', { asker, userId, name, admin });
      const usable = this.options
        .tools()
        .filter((tool) => !tool.adminOnly || admin)
        .flatMap((tool) => (tool.commands ?? []).map((command) => command.name));
      if (usable.length) this.say(at, `没有指令「${name}」，可用的有：${usable.join('、')}`);
      return undefined;
    }
    const { tool, command } = found;
    if (tool.adminOnly && !admin) {
      log.info('command not for them', { asker, userId, name });
      this.say(at, `你无权调用「${name}」指令，只有主播和${adminNames}才可以`);
      return undefined;
    }
    const parsed = command.parse(args);
    if ('usage' in parsed) {
      log.info('command', { asker, userId, name, args, ok: false });
      this.say(at, parsed.usage);
      return undefined;
    }
    const now = this.options.now ?? Date.now;
    const start = now();
    return tool
      .call(parsed.args, { asker, userId, question: chat.content, admin, direct: true })
      .then(
        (result: ToolResult) => {
          log.info('command', {
            asker,
            userId,
            name,
            args: parsed.args,
            ok: !result.isError,
            ms: now() - start,
          });
          const reply = result.isError ? result.text : command.say(result, parsed.args);
          if (reply) this.say(at, reply);
        },
        (err: unknown) => {
          log.error('command failed', { name, error: errorMessage(err) });
          this.say(at, `指令「${name}」出错了，没有完成`);
        },
      );
  }
}
