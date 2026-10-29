import type { Frame, Locator, Page } from 'playwright-core';
import { ChatBox } from './chat-box';
import { type RawProtoMessage } from './douyin/proto';
import {
  isEnterOf,
  readEnterAnswer,
  STREAM_URL,
  type EnterAnswer,
  type Entered,
} from './douyin/enter-answer';
import type { FansLampAnswer, LikeAnswer, RoomMeta } from '@dy-apps/room-feed-protocol';
import {
  CLOSE_ICON,
  FANS_ICON,
  FANS_JOIN_BUTTON,
  FANS_LAMP_BUTTON,
  FANS_LAMP_SENT,
  FOLLOW_BUTTON,
  NOTICE_OK_TEXT,
  PANEL_TEXT,
  PLAYER_CLICK,
  RIGHT_PANEL_CLOSE_SVG,
  ROOM_INFO_BAR,
} from './douyin/page-map';
import { parseRoomMeta } from './douyin/room-meta';
import { LikeHold } from './like-hold';
import { PageShots } from './page-shots';
import { RoomEndedError } from './errors';
import { FansLamp, type FansLampSurface, type PanelFrame, type PanelTarget } from './fans-lamp';
import { PushTracker } from './push-tracker';

/** What a room page tells the Room. */
export interface RoomPageHandlers {
  /** A push frame came in, with these messages (maybe none). */
  onPush(messages: RawProtoMessage[]): void;
  /** The chat connection or the page itself went away; called once, never after `close()`. */
  onClosed(why: string): void;
  /**
   * The page shows another room now (Douyin moved it to one it recommends): what comes in isn't
   * this room's, so room-feed should stop rather than reopen. Called once, instead of `onClosed`.
   */
  onWrongRoom(why: string): void;
}

/** The live room open in Chrome: Douyin's page does the signing, we only watch and type. */
export interface RoomPage {
  /** The streamer, from the page's HTML; null if it couldn't be read. */
  readonly meta: RoomMeta | null;
  /** The FLV or HLS URL the player pulls, or null before it has one. */
  streamUrl(): string | null;
  /** Types `text` into the chat box and presses Enter; throws when it doesn't go. */
  typeChat(text: string): Promise<void>;
  /** The player as a JPEG. */
  screenshot(): Promise<Uint8Array>;
  /**
   * Holds the like key on the player until about `likes` likes have gone, or Douyin says 手速太快了:
   * about how many went, and how long it held.
   */
  holdLike(likes: number): Promise<Omit<LikeAnswer, 'ok'>>;
  /**
   * Sends today's 粉丝团灯牌 from the 粉丝团 panel, following the streamer first if need be:
   * `already` when today's was sent before. Throws when the panel doesn't show either.
   */
  sendFansLamp(): Promise<FansLampAnswer['result']>;
  close(): Promise<void>;
}

export type OpenRoomPage = (roomId: string, handlers: RoomPageHandlers) => Promise<RoomPage>;

/** One frame of the 粉丝团 panel, its targets found by the page map's selectors and texts. */
class PagePanelFrame implements PanelFrame {
  constructor(private readonly frame: Frame) {}

  async has(target: PanelTarget): Promise<boolean> {
    return (
      (await this.find(target)
        .count()
        .catch(() => 0)) > 0
    );
  }

  click(target: PanelTarget): Promise<void> {
    return this.find(target).first().click();
  }

  private find(target: PanelTarget): Locator {
    switch (target) {
      case 'notice':
        return this.frame.getByText(NOTICE_OK_TEXT, { exact: true });
      case 'join':
        return this.frame.locator(PANEL_TEXT).filter({ hasText: FANS_JOIN_BUTTON });
      case 'send':
        return this.frame.locator(PANEL_TEXT).filter({ hasText: FANS_LAMP_BUTTON });
      case 'sent':
        return this.frame.getByText(FANS_LAMP_SENT);
    }
  }
}

/** The Playwright side of the 灯牌 steps: Douyin's page, as the page map describes it. */
class PageFansSurface implements FansLampSurface {
  private readonly follow: Locator;
  private readonly fans: Locator;

  constructor(private readonly page: Page) {
    const bar = page.locator(ROOM_INFO_BAR);
    this.follow = bar.locator('button').filter({ hasText: FOLLOW_BUTTON }).first();
    this.fans = bar
      .locator('button')
      .filter({ has: page.locator(FANS_ICON) })
      .first();
  }

  followVisible(): Promise<boolean> {
    return this.follow.isVisible().catch(() => false);
  }

  clickFollow(): Promise<void> {
    return this.follow.click();
  }

  waitForPanelButton(): Promise<void> {
    return this.fans.waitFor({ timeout: 15_000 });
  }

  openPanel(): Promise<void> {
    return this.fans.click({ timeout: 15_000 });
  }

  panelFrames(): PanelFrame[] {
    return this.page.frames().map((frame) => new PagePanelFrame(frame));
  }

  /** Clicks the × of the panel on the right (the 粉丝团 one, among others), if one is open. */
  async closePanel(): Promise<void> {
    const close = this.page
      .locator(RIGHT_PANEL_CLOSE_SVG)
      .filter({ has: this.page.locator(CLOSE_ICON) })
      .first();
    if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
  }
}

/** The room page open in Chrome, which `ChromeRooms` opens: the pieces below, wired to the page's events. */
export class LivePage implements RoomPage {
  private readonly push = new PushTracker(() => this.entered?.innerRoomId);
  private readonly fansLamp: FansLamp;
  private readonly likeHold: LikeHold;
  private readonly shots: PageShots;
  private readonly chatBox: ChatBox;
  private closed = false;
  private requestedStream: string | null = null;
  private entered: Entered | null = null;
  private markEntered = () => {};
  private readonly enteredOnce = new Promise<void>((resolve) => (this.markEntered = resolve));
  meta: RoomMeta | null = null;

  private constructor(
    private readonly page: Page,
    private readonly roomId: string,
    private readonly handlers: RoomPageHandlers,
    shotsDir: string | undefined,
    random: () => number,
  ) {
    this.shots = new PageShots(page, shotsDir);
    this.chatBox = new ChatBox(page, (name) => this.shots.save(name));
    this.fansLamp = new FansLamp(new PageFansSurface(page), {
      wait: (ms) => page.waitForTimeout(ms),
      random,
    });
    this.likeHold = new LikeHold(
      {
        focusPlayer: () => this.focusPlayer(),
        keyDown: () => page.keyboard.down('z'),
        keyUp: () => page.keyboard.up('z'),
        counter: () => this.likeCounter(),
        saysTooFast: () => this.saysTooFast(),
      },
      { wait: (ms) => page.waitForTimeout(ms) },
    );
  }

  static async open(
    page: Page,
    roomId: string,
    handlers: RoomPageHandlers,
    shotsDir: string | undefined,
    random: () => number,
  ): Promise<LivePage> {
    const live = new LivePage(page, roomId, handlers, shotsDir, random);
    await live.watch();
    const response = await page.goto(`https://live.douyin.com/${roomId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    live.meta = parseRoomMeta((await response?.text().catch(() => '')) ?? '');
    try {
      await page.waitForFunction(() => document.title.length > 0, undefined, { timeout: 15_000 });
    } catch {
      // No title yet: carry on anyway.
    }
    await page.waitForTimeout(2500);
    // A headless player starts, and the chat socket opens, only after a click.
    await page.mouse.click(PLAYER_CLICK.x, PLAYER_CLICK.y).catch(() => {});
    await live.checkLive();
    return live;
  }

  /**
   * Throws RoomEndedError when the room isn't streaming, from the enter answer or, when that
   * doesn't come, the page's 直播已结束.
   */
  private async checkLive(): Promise<void> {
    await Promise.race([this.enteredOnce, this.page.waitForTimeout(15_000)]);
    const ended =
      this.entered?.ended ??
      (await this.page
        .evaluate(() => document.body.innerText.includes('直播已结束'))
        .catch(() => false));
    if (ended) throw new RoomEndedError('直播已结束');
  }

  /** Starts watching sockets and the stream URL, before the page loads. */
  private async watch(): Promise<void> {
    const cdp = await this.page.context().newCDPSession(this.page);
    await cdp.send('Network.enable');
    cdp.on('Network.webSocketFrameReceived', (params) => {
      if (this.closed) return;
      const decision = this.push.frame(params.requestId, params.response.payloadData);
      if (decision.kind === 'push') this.handlers.onPush(decision.messages);
      else if (decision.kind === 'wrongRoom') void this.wrongRoom(decision.why);
    });
    cdp.on('Network.webSocketClosed', (params) => {
      if (this.push.closed(params.requestId)) this.fail('弹幕连接断开');
    });
    this.page.on('close', () => this.fail('直播间页面被关闭'));

    // The stream URL, from two places. The player's own request is the right one, but it's
    // missed when the player pulls from a Web Worker (it does when logged in); the enter
    // request's FLV URLs, asked for as the page loads, back it up. Both carry a signature and
    // change when the player reconnects.
    this.page.on('request', (req) => {
      if (STREAM_URL.test(req.url())) this.requestedStream = req.url();
    });
    this.page.on('response', (res) => {
      if (!isEnterOf(res.url(), this.roomId)) return;
      res
        .json()
        .then((body: EnterAnswer) => {
          const entered = readEnterAnswer(body ?? {});
          if (!entered) return;
          this.entered = { ...entered, flvUrl: entered.flvUrl ?? this.entered?.flvUrl ?? null };
          this.markEntered();
        })
        .catch(() => {});
    });
  }

  private fail(why: string): void {
    if (this.closed) return;
    this.closed = true;
    this.handlers.onClosed(why);
  }

  /** Keeps the page's address and a picture of it in the reason, to see where Douyin took it. */
  private async wrongRoom(why: string): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const shot = await this.shots.save('wrong-room').catch(() => null);
    this.handlers.onWrongRoom(`${why}，页面在 ${this.page.url()}${shot ? `，截图：${shot}` : ''}`);
  }

  streamUrl(): string | null {
    return this.requestedStream ?? this.entered?.flvUrl ?? null;
  }

  /** Typed into the chat box (see ChatBox); with a picture of the page when it fails. */
  typeChat(text: string): Promise<void> {
    return this.chatBox.type(text);
  }

  screenshot(): Promise<Uint8Array> {
    return this.shots.player();
  }

  /**
   * Holds Douyin's like key (z) until about `likes` likes have gone (see LikeHold). It clicks the
   * player first, so the keys go to it, not to the chat box (where they'd be typed).
   */
  holdLike(likes: number): Promise<Omit<LikeAnswer, 'ok'>> {
    return this.likeHold.hold(likes);
  }

  /** Clicks the middle of the player, or without one lets go of whatever has the focus. */
  private async focusPlayer(): Promise<void> {
    const box = await this.shots.playerBox();
    if (box) {
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    }
  }

  /**
   * The number on Douyin's like counter, the 「x<N>」 by the heart while liking (a span in an
   * element reading x and it), or null when it doesn't show. Found by its text: the class names
   * are hashed.
   */
  private likeCounter(): Promise<number | null> {
    return this.page
      .evaluate(() => {
        for (const span of Array.from(document.querySelectorAll('span'))) {
          const shown = /^[x×]\s*(\d+)$/.exec(span.parentElement?.textContent?.trim() ?? '');
          if (shown && span.textContent?.trim() === shown[1]) return Number(shown[1]);
        }
        return null;
      })
      .catch(() => null);
  }

  /** See FansLamp: the steps are there, this page is what they click on. */
  sendFansLamp(): Promise<FansLampAnswer['result']> {
    return this.fansLamp.send();
  }

  /** Whether the page shows Douyin's 手速太快了, its notice for liking too fast. */
  private saysTooFast(): Promise<boolean> {
    return this.page
      .evaluate(() => document.body.innerText.includes('手速太快了'))
      .catch(() => false);
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.page
      .context()
      .close()
      .catch(() => {});
  }
}
