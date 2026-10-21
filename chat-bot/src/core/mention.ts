import type { IncomingChat } from './room-events';

/** Who the bot is: the Douyin account room-feed is logged in as. */
export interface BotIdentity {
  nickname: string;
  /** The account's user id; matches @mentions exactly when Douyin sends it. */
  userId?: string;
}

/** Whether the bot's own account sent this chat, so it never answers itself. */
export function isFromBot(chat: IncomingChat, bot: BotIdentity): boolean {
  if (chat.userId === undefined) return false;
  return bot.userId ? chat.userId === bot.userId : chat.nickname === bot.nickname;
}

/**
 * What a chat asks the bot, with the @mention taken out, or null when it doesn't mention the bot.
 * A picked @mention and a typed `@昵称` both count.
 */
export function questionFor(chat: IncomingChat, bot: BotIdentity): string | null {
  const tag = `@${bot.nickname}`;
  const mentioned =
    chat.mentions.some((mention) =>
      bot.userId && mention.userId ? mention.userId === bot.userId : mention.text.trim() === tag,
    ) || chat.content.includes(tag);
  if (!mentioned) return null;
  return chat.content.split(tag).join(' ').replace(/\s+/g, ' ').trim();
}
