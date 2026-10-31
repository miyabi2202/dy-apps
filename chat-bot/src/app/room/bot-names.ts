import type { Alias } from '../../core/viewers/alias';

export interface BotNamesOptions {
  /** The bot's own nickname: its messages in the chat don't count as anyone chatting. */
  botName: string;
  /** The bot's own user id, to find its own chat lines (and what it wears) by; its nickname without it. */
  botId?: string;
  /** Other names the bot is called in this room (room_config.json's `aliases`), read each time. */
  aliases?: () => readonly Alias[];
  /** What to take off the start of a nickname when the bot @s someone (`atTrimStart`), read each time. */
  atTrimStart?: () => readonly string[];
  /** The time zone the room's times are shown in (room_config.json's `timeZone`), read each time. */
  timeZone?: () => string;
}

/** What the bot is called in the room, and the room's own way of writing names and times. */
export class BotNames {
  readonly botName: string;
  readonly botId: string | undefined;

  constructor(private readonly options: BotNamesOptions) {
    this.botName = options.botName;
    this.botId = options.botId;
  }

  /** Every name the bot is called by here: its nickname first, then the room's aliases. */
  callNames(): readonly Alias[] {
    return [{ name: this.botName, heardAs: [] }, ...(this.options.aliases?.() ?? [])];
  }

  /** Other names the bot is called in this room, which mean it too. */
  aliases(): readonly string[] {
    return this.callNames()
      .slice(1)
      .map(({ name }) => name);
  }

  /** The room's 单推符号, taken off a nickname when the bot has to shorten its @ (see atName). */
  atTrimStart(): readonly string[] {
    return this.options.atTrimStart?.() ?? [];
  }

  /** The time zone the room's times are shown in: the streamer's (the machine's when not given). */
  timeZone(): string | undefined {
    return this.options.timeZone?.();
  }
}
