import { PageActionError } from './errors';
import { Pace } from './pace';

/** How long after Enter the box is looked at, to see that it emptied. */
const SENT_LOOK_MS = 500;
/** How many times leftover text is cleared before giving up. */
const CLEAR_TRIES = 3;

/** The room page's chat box (Douyin's Slate editor), as far as typing a chat needs it. */
export interface ChatSurface {
  /** Waits for the chat box; throws when it doesn't show in time. */
  waitForBox(): Promise<void>;
  /** Clicks the box; when a popup's mask takes the click, presses Escape and focuses the box instead. */
  clickBox(): Promise<void>;
  /** The box's text; an empty editor holds only a zero-width placeholder, which doesn't count. */
  text(): Promise<string>;
  /** Selects everything in the box and deletes it, by the keyboard. */
  selectAllAndDelete(): Promise<void>;
  /** Goes to the end of the box and presses Backspace `times` times. */
  backspaceFromEnd(times: number): Promise<void>;
  /** Types `text` as typed input (Slate reacts only to real input) and presses Enter. */
  typeAndSend(text: string): Promise<void>;
}

export interface ChatBoxOptions {
  /** How the click and the typing are paced (wait, pause, act); real timers by default. */
  pace?: Pace;
  /**
   * Takes a picture of the page when typing fails and gives its path (null if none was taken): a
   * popup's mask or a 禁言 notice shows in it. None by default.
   */
  screenshot?: (name: string) => Promise<string | null>;
}

/**
 * The room page's chat box, typed into and cleared as a person would, by the keyboard, each a
 * Pace step: the box seen, a pause, the click; a pause, clearing what an earlier chat left; a
 * pause, the chat typed and sent.
 */
export class ChatBox {
  private readonly pace: Pace;
  private readonly screenshot: (name: string) => Promise<string | null>;

  constructor(
    private readonly surface: ChatSurface,
    options: ChatBoxOptions = {},
  ) {
    this.pace = options.pace ?? new Pace();
    this.screenshot = options.screenshot ?? (() => Promise.resolve(null));
  }

  /**
   * Sent once the box is empty after Enter; whether Douyin took it, the caller sees from the echo.
   * When it fails, a picture of the page goes with the error.
   */
  async type(text: string): Promise<void> {
    try {
      await this.tryType(text);
    } catch (e) {
      const screenshot = await this.screenshot('chat-failed').catch(() => null);
      const message = e instanceof Error ? e.message : String(e);
      throw new PageActionError(message, { screenshot, cause: e });
    }
  }

  private async tryType(text: string): Promise<void> {
    const { surface, pace } = this;
    await pace.step(
      () =>
        surface.waitForBox().catch(() => {
          throw new PageActionError('找不到弹幕输入框（没有登录、被禁言，或者抖音改版了）');
        }),
      () => surface.clickBox(),
    );
    // What an earlier chat left behind would be sent with this one, so clear it first.
    await this.clear();
    await pace.afterSeen(() => surface.typeAndSend(text));
    await pace.wait(SENT_LOOK_MS);
    if (await surface.text()) {
      await this.clear().catch(() => {});
      throw new PageActionError('回车后输入框没有清空，弹幕可能没有发出（风控、要验证或字数超了）');
    }
  }

  /**
   * Clears what's in the box, a step each time something is seen there: select all and delete,
   * then, if anything's left, Backspace from the end.
   */
  private async clear(): Promise<void> {
    const { surface, pace } = this;
    for (let attempt = 0; attempt < CLEAR_TRIES; attempt++) {
      const left = await surface.text();
      if (!left) return;
      await pace.afterSeen(() =>
        attempt === 0
          ? surface.selectAllAndDelete()
          : surface.backspaceFromEnd([...left].length + 5),
      );
    }
    if (await surface.text()) throw new PageActionError('输入框里有删不掉的文字，没有发送');
  }
}
