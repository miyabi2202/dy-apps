import type { Frame, Locator, Page } from 'playwright-core';
import { ChatBox, type ChatSurface } from './chat-box';
import { type RawProtoMessage } from './douyin/proto';
import {
  isEnterOf,
  readEnterAnswer,
  STREAM_URL,
  type EnterAnswer,
  type Entered,
} from './douyin/enter-answer';
import type {
  FansLampResult,
  HeartResult,
  LikeAnswer,
  RoomMeta,
} from '@dy-apps/room-feed-protocol';
import {
  CHAT_INPUT,
  CLOSE_ICON,
  DIAMOND_BALANCE,
  FANS_ICON,
  FANS_JOIN_BUTTON,
  FANS_LAMP_BUTTON,
  FANS_LAMP_SENT,
  FOLLOW_BUTTON,
  GIFT_PANEL,
  GIFT_SEARCH_ICON,
  GIFT_SEARCH_INPUT,
  GIFT_TILE,
  GIFTS_MORE,
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
import { HeartGift, type GiftPanelSurface } from './heart-gift';
import { Pace } from './pace';
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
   * `already` when today's was sent before, `notEnough` with too few diamonds. Throws when the
   * panel doesn't show either.
   */
  sendFansLamp(): Promise<FansLampResult>;
  /**
   * Sends the streamer one 小心心 (1 diamond) from the gift panel: `sent` with the diamonds left
   * (null when the balance doesn't show), or `notEnough`. Throws when it can't, or the balance
   * doesn't drop.
   */
  sendHeart(): Promise<HeartResult>;
  /** The account's diamonds, by the gift bar's 充值; null when they don't show. */
  balance(): Promise<number | null>;
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

  closeShown(): Promise<boolean> {
    return closeShown(this.page);
  }

  clickClose(): Promise<void> {
    return rightPanelClose(this.page).click({ timeout: 5000 });
  }

  balance(): Promise<number | null> {
    return readBalance(this.page);
  }
}

/** The Playwright side of the chat box: Douyin's Slate editor, as the page map describes it. */
class PageChatSurface implements ChatSurface {
  private readonly box: Locator;

  constructor(private readonly page: Page) {
    this.box = page.locator(CHAT_INPUT);
  }

  waitForBox(): Promise<void> {
    return this.box.waitFor({ state: 'visible', timeout: 5000 });
  }

  async clickBox(): Promise<void> {
    // A popup's mask can cover the box and take the click: a viewer's card, opened when the click
    // that starts the player lands on a streamer's tile in a PK. Typing needs only the focus.
    await this.box.click({ timeout: 3000 }).catch(async () => {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.box.focus();
    });
  }

  async text(): Promise<string> {
    const text = await this.box.innerText();
    return text.replace(/[\u200b\s]/g, '');
  }

  async selectAllAndDelete(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.page.keyboard.press('Backspace');
  }

  async backspaceFromEnd(times: number): Promise<void> {
    const { keyboard } = this.page;
    await keyboard.press('ControlOrMeta+ArrowDown');
    await keyboard.press('End');
    for (let i = 0; i < times; i++) await keyboard.press('Backspace');
  }

  async typeAndSend(text: string): Promise<void> {
    await this.page.keyboard.insertText(text);
    await this.page.keyboard.press('Enter');
  }
}

/** The diamonds by the gift bar's 充值, or null when they don't show. */
async function readBalance(page: Page): Promise<number | null> {
  const text = await page
    .locator(DIAMOND_BALANCE)
    .first()
    .innerText({ timeout: 2000 })
    .catch(() => '');
  const shown = /^\s*(\d+)\s*$/.exec(text);
  return shown ? Number(shown[1]) : null;
}

/** The × of the panel on the right (the 粉丝团 one, the gift one, …). */
function rightPanelClose(page: Page): Locator {
  return page
    .locator(RIGHT_PANEL_CLOSE_SVG)
    .filter({ has: page.locator(CLOSE_ICON) })
    .first();
}

/** Whether the right panel's × shows, which it does while one is open. */
function closeShown(page: Page): Promise<boolean> {
  return rightPanelClose(page)
    .isVisible()
    .catch(() => false);
}

/** How long a 小心心 step waits for what it acts on. */
const GIFT_WAIT = { timeout: 10_000 };

/** The Playwright side of sending a 小心心: the gift bar and panel, as the page map describes them. */
class PageGiftSurface implements GiftPanelSurface {
  private readonly more: Locator;
  private readonly panel: Locator;
  private readonly searchIcon: Locator;
  private readonly searchBox: Locator;

  constructor(private readonly page: Page) {
    this.more = page.locator(GIFTS_MORE).first();
    this.panel = page.locator(GIFT_PANEL);
    this.searchIcon = this.panel.locator(GIFT_SEARCH_ICON).first();
    this.searchBox = this.panel.locator(GIFT_SEARCH_INPUT).first();
  }

  closeShown(): Promise<boolean> {
    return closeShown(this.page);
  }

  clickClose(): Promise<void> {
    return rightPanelClose(this.page).click({ timeout: 5000 });
  }

  balance(): Promise<number | null> {
    return readBalance(this.page);
  }

  waitForMore(): Promise<void> {
    return this.more.waitFor({ timeout: 15_000 });
  }

  clickMore(): Promise<void> {
    return this.more.click(GIFT_WAIT);
  }

  waitForPanel(): Promise<void> {
    return this.panel.waitFor({ timeout: 15_000 });
  }

  searchShown(): Promise<boolean> {
    return this.searchBox.isVisible().catch(() => false);
  }

  waitForSearchIcon(): Promise<void> {
    return this.searchIcon.waitFor(GIFT_WAIT);
  }

  clickSearchIcon(): Promise<void> {
    return this.searchIcon.click(GIFT_WAIT);
  }

  waitForSearchBox(): Promise<void> {
    return this.searchBox.waitFor(GIFT_WAIT);
  }

  typeSearch(text: string): Promise<void> {
    return this.searchBox.fill(text, GIFT_WAIT);
  }

  waitForResult(name: string): Promise<void> {
    return this.result(name).waitFor(GIFT_WAIT);
  }

  clickResult(name: string): Promise<void> {
    return this.result(name).click(GIFT_WAIT);
  }

  private result(name: string): Locator {
    return this.panel
      .locator(GIFT_TILE)
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .first();
  }
}

/** The room page open in Chrome, which `ChromeRooms` opens: the pieces below, wired to the page's events. */
export class LivePage implements RoomPage {
  private readonly push = new PushTracker(() => this.entered?.innerRoomId);
  private readonly fansLamp: FansLamp;
  private readonly gifts: PageGiftSurface;
  private readonly heartGift: HeartGift;
  private readonly likeHold: LikeHold;
  private readonly shots: PageShots;
  private readonly chatBox: ChatBox;
  private readonly pace: Pace;
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
    // One pace for every step on the page: wait for the target, pause, act.
    const pace = new Pace({ wait: (ms) => page.waitForTimeout(ms), random });
    this.pace = pace;
    this.chatBox = new ChatBox(new PageChatSurface(page), {
      pace,
      screenshot: (name) => this.shots.save(name),
    });
    this.fansLamp = new FansLamp(new PageFansSurface(page), { pace });
    this.gifts = new PageGiftSurface(page);
    this.heartGift = new HeartGift(this.gifts, { pace });
    this.likeHold = new LikeHold(
      {
        playerShown: async () => (await this.shots.playerBox()) !== null,
        clickPlayer: () => this.clickPlayer(),
        blurFocus: () =>
          page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()),
        keyDown: () => page.keyboard.down('z'),
        keyUp: () => page.keyboard.up('z'),
        counter: () => this.likeCounter(),
        saysTooFast: () => this.saysTooFast(),
      },
      { pace },
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
    // A headless player starts, and the chat socket opens, only after a click: the page has
    // settled (its title, then 2.5 s), so it's a step after a pause like any other.
    await live.pace.afterSeen(() =>
      page.mouse.click(PLAYER_CLICK.x, PLAYER_CLICK.y).catch(() => {}),
    );
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

  /** Clicks the middle of the player (if it's still there). */
  private async clickPlayer(): Promise<void> {
    const box = await this.shots.playerBox();
    if (box) await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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
  sendFansLamp(): Promise<FansLampResult> {
    return this.fansLamp.send();
  }

  /** See HeartGift: the steps are there, this page is what they click on. */
  sendHeart(): Promise<HeartResult> {
    return this.heartGift.send();
  }

  balance(): Promise<number | null> {
    return this.gifts.balance();
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
