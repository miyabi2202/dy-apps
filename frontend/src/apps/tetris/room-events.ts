import type { DanmakuMessage, Logger } from '@dy-apps/services';
import type { GameEngine, GiftResponse } from './core/game';
import type { Sender } from './core/types';
import type { GiftFeed } from './gift-feed';
import { log as appLog } from './log';

/**
 * Where the live room's events go into the game: gifts through the gift wall (which keeps a
 * card for each), chat as a vote, likes towards the like meter. The one
 * place that knows which game feature a chat line is for.
 */
export class RoomEvents {
  private readonly logger: Logger;

  constructor(
    private readonly engine: GameEngine,
    private readonly gifts: GiftFeed,
    { logger = appLog }: { logger?: Logger } = {},
  ) {
    this.logger = logger;
  }

  gift(message: DanmakuMessage): GiftResponse {
    return this.gifts.send(message);
  }

  /** A viewer's chat line: a vote, while one is open. Returns whether the game took it. */
  comment(user: Sender, text: string): boolean {
    const taken = this.engine.castVote(user, text);
    if (taken) this.logger.debug(`viewer ${user.name}: ${text.trim()}`);
    return taken;
  }

  /** `count` likes from a viewer, towards the like meter. */
  like(user: Sender, count: number): boolean {
    return this.engine.addLikes(user, count);
  }
}
