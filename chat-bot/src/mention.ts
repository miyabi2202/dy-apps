import type { DyhubCommentEvent } from '@dy-apps/services';

/** Who the bot is: the Douyin account DyHub is logged in as. */
export interface BotIdentity {
  nickname: string;
  /** The account's user id; matches @mentions exactly when Douyin sends it. */
  userId?: string;
}

/** Whether the bot's own account sent this chat, so it never answers itself. */
export function isFromBot(event: DyhubCommentEvent, bot: BotIdentity): boolean {
  const user = event.user;
  if (!user) return false;
  return bot.userId ? user.id === bot.userId : user.nickname === bot.nickname;
}

/**
 * What a chat asks the bot, with the @mention taken out, or null when it doesn't mention the bot.
 * Douyin marks a picked @mention as a `mention` part; a typed `@昵称` is only text, so both count.
 */
export function questionFor(event: DyhubCommentEvent, bot: BotIdentity): string | null {
  const tag = `@${bot.nickname}`;
  const { content, parts } = event.data;
  const mentioned =
    parts?.some(
      (part) =>
        part.type === 'mention' &&
        (bot.userId && part.userId ? part.userId === bot.userId : part.text.trim() === tag),
    ) || content.includes(tag);
  if (!mentioned) return null;
  return content.split(tag).join(' ').replace(/\s+/g, ' ').trim();
}
