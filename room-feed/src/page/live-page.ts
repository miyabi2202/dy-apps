import type { Page } from 'playwright-core';
import { ChatBox } from '../chat-box';
import {
  isEnterOf,
  readEnterAnswer,
  STREAM_URL,
  type EnterAnswer,
  type Entered,
} from '../douyin/enter-answer';
import type {
  FansLampResult,
  HeartResult,
  LikeResult,
  RoomMeta,
} from '@dy-apps/room-feed-protocol';
import { PAGE_WAIT, PLAYER_CLICK } from '../douyin/page-map';
import { parseRoomMeta } from '../douyin/room-meta';
import { LikeHold } from '../like-hold';
import { PageShots } from '../page-shots';
import { RoomEndedError } from '../errors';
import { FansLamp } from '../fans-lamp';
import { HeartGift } from '../heart-gift';
import { Pace } from '../pace';
import { PushTracker } from '../push-tracker';
import type { RoomPage, RoomPageHandlers } from '../room-page';
import { PageChatSurface } from './chat-surface';
import { PageFansSurface } from './fans-surface';
import { PageGiftSurface } from './gift-surface';
import { PageLikeSurface } from './like-surface';
import { PageChrome } from './page-chrome';

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
    const chrome = new PageChrome(page);
    this.fansLamp = new FansLamp(new PageFansSurface(page, chrome), { pace });
    this.gifts = new PageGiftSurface(page, chrome);
    this.heartGift = new HeartGift(this.gifts, { pace });
    this.likeHold = new LikeHold(new PageLikeSurface(page, this.shots), { pace });
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
      timeout: PAGE_WAIT.load,
    });
    live.meta = parseRoomMeta((await response?.text().catch(() => '')) ?? '');
    try {
      await page.waitForFunction(() => document.title.length > 0, undefined, {
        timeout: PAGE_WAIT.title,
      });
    } catch {
      // No title yet: carry on anyway.
    }
    await page.waitForTimeout(PAGE_WAIT.settle);
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
    await Promise.race([this.enteredOnce, this.page.waitForTimeout(PAGE_WAIT.enter)]);
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
  holdLike(likes: number): Promise<LikeResult> {
    return this.likeHold.hold(likes);
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

  async close(): Promise<void> {
    this.closed = true;
    await this.page
      .context()
      .close()
      .catch(() => {});
  }
}
