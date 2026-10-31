/** What the room throws for a request that needs its page while the chat connection isn't up (yet, or any more). */
export class NotLiveError extends Error {}

/** What a room page's open throws when the stream has ended (or not started): nothing to wait for. */
export class RoomEndedError extends Error {}

/**
 * What a room page's action (typing a chat, holding the like key, sending the 灯牌 or a 小心心) throws when it
 * doesn't go. With a `screenshot` (the path of a picture of the page, to see what got in the way),
 * the message ends with its path.
 */
export class PageActionError extends Error {
  readonly screenshot?: string;

  constructor(message: string, options: { screenshot?: string | null; cause?: unknown } = {}) {
    const { screenshot, cause } = options;
    super(
      screenshot ? `${message}\n截图：${screenshot}` : message,
      'cause' in options ? { cause } : {},
    );
    if (screenshot) this.screenshot = screenshot;
  }
}

/** The HTTP status to answer a failed request with: 409 when the room isn't live, else 500. */
export function httpStatusOf(e: unknown): number {
  return e instanceof NotLiveError ? 409 : 500;
}
