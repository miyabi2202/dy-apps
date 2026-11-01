import type { BotAccount, Log } from '../ports';

export interface WaitForAccountOptions {
  /** Who room-feed says its page is logged in as; null while it hasn't said, or isn't up yet. */
  account: () => Promise<BotAccount | 'loggedOut' | null>;
  log: Log;
  /** How long to wait before asking again. */
  everyMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The bot's own account, once room-feed says which it is logged in as: asked every `everyMs`, as
 * the bot is started before room-feed. Says once that it's waiting, and once that room-feed isn't
 * logged in while it isn't.
 */
export async function waitForAccount({
  account,
  log,
  everyMs = 2_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: WaitForAccountOptions): Promise<BotAccount> {
  let said: 'waiting' | 'loggedOut' | null = null;
  for (;;) {
    const answer = await account().catch(() => null);
    if (answer && answer !== 'loggedOut') {
      log.info('logged in as', { nickname: answer.nickname, uid: answer.uid });
      return { uid: answer.uid, nickname: answer.nickname };
    }
    if (answer === 'loggedOut' && said !== 'loggedOut') {
      log.warn(
        'room-feed is not logged in to Douyin: run pnpm room-feed login, then start room-feed again',
      );
      said = 'loggedOut';
    } else if (!said) {
      log.info('waiting for room-feed to say which account it is logged in as');
      said = 'waiting';
    }
    await sleep(everyMs);
  }
}
