/** One chat message in the room, as the bot remembers it. */
export interface ChatLine {
  ts: number;
  /** Missing for an anonymous viewer. */
  userId?: string;
  nickname: string;
  content: string;
  /** The badges shown by their name (a 直播间会员's `V` or `V年`), when room-feed sends them. */
  badges?: readonly string[];
  /** The fan club shown by their name: its level, and whose it is (the streamer's uid) when room-feed says. */
  fansClub?: { level: number; anchorId?: string };
  /** Their wealth level, when room-feed sends it. */
  payLevel?: number;
}

/** A chat message as it arrives, with the people it @s by picking them from the list. */
export interface IncomingChat extends ChatLine {
  /**
   * Douyin's picked @mentions (`@昵称` with the user id when Douyin sends it). A typed `@昵称` is
   * only text in `content`.
   */
  mentions: { text: string; userId?: string }[];
}

/** Gifts a viewer sent, counted once each. */
export interface Gift {
  userId: string;
  nickname: string;
  name: string;
  count: number;
  /** What they're worth all together, in diamonds (抖币). */
  diamonds: number;
}
