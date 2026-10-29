import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import { BROWSER_ARGS, hideAutomation, USER_AGENT } from './chrome';
import { decodeFrame, messageRoomId, type RawProtoMessage } from './douyin/proto';
import type { RoomMeta } from '@dy-apps/room-feed-protocol';
import { parseRoomMeta } from './douyin/room-meta';
import { LikeTally } from './like-tally';
import { browserCookies } from './login-file';
import { RoomEndedError } from './room';

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
  holdLike(likes: number): Promise<{ liked: number; heldMs: number; tooFast: boolean }>;
  /**
   * Sends today's 粉丝团灯牌 from the 粉丝团 panel, following the streamer first if need be:
   * `already` when today's was sent before. Throws when the panel doesn't show either.
   */
  sendFansLamp(): Promise<'sent' | 'already'>;
  close(): Promise<void>;
}

export type OpenRoomPage = (roomId: string, handlers: RoomPageHandlers) => Promise<RoomPage>;

/** The chat box: Douyin's Slate editor, found by attributes that survive its class-name hashing. */
const CHAT_INPUT = '[data-e2e="live-chatting"] [data-slate-editor="true"][contenteditable="true"]';

/** How often a held key sends keydown again, about as often as a held key repeats. */
const LIKE_REPEAT_MS = 100;
/** How many likes a second of holding gives, as measured on 2026-10-29: for when the counter doesn't show. */
const GUESSED_LIKES_PER_SECOND = 5;
/** The longest one like holds the key, whatever the counter says. */
const MAX_LIKE_MS = 60_000;

/** How long one opening of the 粉丝团 panel may take to load and answer. */
const FANS_PANEL_MS = 20_000;
/** How many times the panel is opened before giving up: a fresh one may not be stuck on a notice. */
const FANS_PANEL_TRIES = 2;
/** The 粉丝团 panel's button that sends the 灯牌 (its words differ between accounts). */
const FANS_LAMP_BUTTON = /^(送灯牌|送出粉丝灯牌)$/;
/** The panel's button for joining the 粉丝团 (1 diamond), shown instead of the 灯牌 to a viewer not in it yet. */
const FANS_JOIN_BUTTON = /^加入粉丝团$/;
/** The panel's line once today's 灯牌 is sent: 「今日第7位送灯牌，连续3天」. */
const FANS_LAMP_SENT = /今日第\d+位送灯牌/;

/** The player's stream request: FLV or HLS. */
const STREAM_URL = /^https?:\/\/[^/]+\/.+\.(flv|m3u8)(\?|$)/;

/** The part of webcast/room/web/enter/'s answer we read. */
interface EnterAnswer {
  data?: {
    data?: {
      id_str?: string;
      status?: number;
      stream_url?: { flv_pull_url?: Record<string, string> };
    }[];
  };
}

/** The room as webcast/room/web/enter/ tells it. */
interface Entered {
  /** The internal room id push messages carry (not the web one in the URL); '' if missing. */
  innerRoomId: string;
  /** The stream has ended, or not started: status 4 (2 is live). */
  ended: boolean;
  /** An FLV URL: the lowest quality, since all sound alike; null if none. */
  flvUrl: string | null;
}

function readEnterAnswer(body: EnterAnswer): Entered | null {
  const room = body.data?.data?.[0];
  if (!room) return null;
  return { innerRoomId: room.id_str ?? '', ended: room.status === 4, flvUrl: flvUrl(room) };
}

function flvUrl(room: NonNullable<NonNullable<EnterAnswer['data']>['data']>[number]) {
  const urls = room.stream_url?.flv_pull_url;
  if (!urls) return null;
  for (const quality of ['SD2', 'SD1', 'HD1', 'FULL_HD1']) {
    if (urls[quality]) return urls[quality];
  }
  return Object.values(urls)[0] ?? null;
}

/** Whether an enter request is for room `roomId`: the page asks again for a room it moves to. */
function isEnterOf(url: string, roomId: string): boolean {
  if (!url.includes('/webcast/room/web/enter/')) return false;
  return new URL(url).searchParams.get('web_rid') === roomId;
}

export interface ChromeOptions {
  executablePath: string;
  headless: boolean;
  /** The saved login's cookies (`k=v; k=v`), read on every open; null when not logged in. */
  cookie: () => string | null;
  /** Where a screenshot of the whole page goes when something covers the chat box; none if unset. */
  shotsDir?: string;
}

/**
 * Opens room pages in one Chrome, started on the first open and again if it dies. Each page
 * gets a fresh context with the saved login, so a reopened page starts clean.
 */
export class ChromeRooms {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly options: ChromeOptions) {}

  readonly open: OpenRoomPage = async (roomId, handlers) => {
    const browser = await this.launch();
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    });
    try {
      await hideAutomation(context);
      const cookie = this.options.cookie();
      if (cookie) await context.addCookies(browserCookies(cookie));
      const page = await context.newPage();
      return await LivePage.open(page, roomId, handlers, this.options.shotsDir);
    } catch (e) {
      await context.close().catch(() => {});
      throw e;
    }
  };

  async close(): Promise<void> {
    const browser = await this.browser?.catch(() => null);
    this.browser = null;
    await browser?.close().catch(() => {});
  }

  private async launch(): Promise<Browser> {
    const running = await this.browser?.catch(() => null);
    if (running?.isConnected()) return running;
    this.browser = chromium.launch({
      executablePath: this.options.executablePath,
      headless: this.options.headless,
      args: [
        ...BROWSER_ARGS,
        '--autoplay-policy=no-user-gesture-required',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--mute-audio',
      ],
    });
    return this.browser;
  }
}

class LivePage implements RoomPage {
  /** WebSockets (CDP request ids) that have sent push frames: chat is down only when all close. */
  private readonly pushSockets = new Set<string>();
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
    private readonly shotsDir: string | undefined,
  ) {}

  static async open(
    page: Page,
    roomId: string,
    handlers: RoomPageHandlers,
    shotsDir?: string,
  ): Promise<LivePage> {
    const live = new LivePage(page, roomId, handlers, shotsDir);
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
    await page.mouse.click(720, 450).catch(() => {});
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
    // CDP frames don't say which socket's URL they came from, so every frame is tried; those
    // that aren't Douyin's push frames fail to decode and are skipped.
    cdp.on('Network.webSocketFrameReceived', (params) => {
      const data = params.response.payloadData;
      if (!data || this.closed) return;
      let frame;
      try {
        frame = decodeFrame(Buffer.from(data, 'base64'));
      } catch {
        return;
      }
      if (!frame.push) return;
      this.pushSockets.add(params.requestId);
      // Until the enter answer is in, there's nothing to check against.
      const expected = this.entered?.innerRoomId;
      const other =
        expected && frame.messages.map(messageRoomId).find((id) => id && id !== expected);
      if (other) {
        void this.wrongRoom(`收到了别的直播间（${other}）的弹幕，不是本直播间的（${expected}）`);
        return;
      }
      this.handlers.onPush(frame.messages);
    });
    cdp.on('Network.webSocketClosed', (params) => {
      // The page's other sockets don't matter; chat is down when every push socket has closed.
      if (this.pushSockets.delete(params.requestId) && this.pushSockets.size === 0) {
        this.fail('弹幕连接断开');
      }
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
    const shot = await this.saveShot('wrong-room').catch(() => null);
    this.handlers.onWrongRoom(`${why}，页面在 ${this.page.url()}${shot ? `，截图：${shot}` : ''}`);
  }

  streamUrl(): string | null {
    return this.requestedStream ?? this.entered?.flvUrl ?? null;
  }

  /**
   * Sent once the box is empty after Enter; whether Douyin took it, the caller sees from the echo.
   * When it fails, a picture of the page (a popup's mask, a 禁言 notice) goes with the error.
   */
  async typeChat(text: string): Promise<void> {
    try {
      await this.tryTypeChat(text);
    } catch (e) {
      const shot = await this.saveShot('chat-failed').catch(() => null);
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(shot ? `${message}\n截图：${shot}` : message, { cause: e });
    }
  }

  private async tryTypeChat(text: string): Promise<void> {
    const input = this.page.locator(CHAT_INPUT);
    try {
      await input.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      throw new Error('找不到弹幕输入框（没有登录、被禁言，或者抖音改版了）');
    }
    // A popup's mask can cover the box and take the click: a viewer's card, opened when the click
    // that starts the player lands on a streamer's tile in a PK. Typing needs only the focus.
    await input.click({ timeout: 3000 }).catch(async () => {
      await this.page.keyboard.press('Escape').catch(() => {});
      await input.focus();
    });
    // What an earlier chat left behind would be sent with this one, so clear it first.
    await this.clearChatInput();
    await this.page.keyboard.insertText(text);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(500);
    if (await this.chatInputText()) {
      await this.clearChatInput().catch(() => {});
      throw new Error('回车后输入框没有清空，弹幕可能没有发出（风控、要验证或字数超了）');
    }
  }

  /** The whole visible page as a PNG in `shotsDir`; its path, or null with no `shotsDir`. */
  private async saveShot(name: string): Promise<string | null> {
    if (!this.shotsDir) return null;
    await mkdir(this.shotsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = join(this.shotsDir, `${stamp}-${name}.png`);
    await this.page.screenshot({ path, timeout: 10_000 });
    return path;
  }

  /** The box's text; an empty editor holds only a zero-width placeholder. */
  private async chatInputText(): Promise<string> {
    const text = await this.page.locator(CHAT_INPUT).innerText();
    return text.replace(/[\u200b\s]/g, '');
  }

  /**
   * Slate reacts only to real input, so the keyboard clears the box rather than fill(): select
   * all and delete, then, if anything's left, Backspace from the end.
   */
  private async clearChatInput(): Promise<void> {
    const { keyboard } = this.page;
    for (let attempt = 0; attempt < 3; attempt++) {
      const left = await this.chatInputText();
      if (!left) return;
      if (attempt === 0) {
        await keyboard.press('ControlOrMeta+A');
        await keyboard.press('Backspace');
      } else {
        await keyboard.press('ControlOrMeta+ArrowDown');
        await keyboard.press('End');
        for (let i = 0; i < [...left].length + 5; i++) await keyboard.press('Backspace');
      }
    }
    if (await this.chatInputText()) throw new Error('输入框里有删不掉的文字，没有发送');
  }

  /** Just the player: the page's largest video, else its largest canvas, else the whole page. */
  async screenshot(): Promise<Uint8Array> {
    const clip = await this.playerBox();
    return this.page.screenshot({
      type: 'jpeg',
      quality: 80,
      timeout: 10_000,
      ...(clip ? { clip } : {}),
    });
  }

  /**
   * Holds Douyin's like key (z), as a held key does, a keydown every LIKE_REPEAT_MS, until the
   * counter by the heart has added up to `likes` (see LikeTally), and lets go at once when the
   * page says 手速太快了: Douyin's limit, a hard stop. Without a counter, it guesses from the time
   * held (GUESSED_LIKES_PER_SECOND); either way, never longer than MAX_LIKE_MS. It clicks the
   * player first, so the keys go to it, not to the chat box (where they'd be typed).
   */
  async holdLike(likes: number): Promise<{ liked: number; heldMs: number; tooFast: boolean }> {
    const box = await this.playerBox();
    if (box) {
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    }
    const tally = new LikeTally(await this.likeCounter());
    const { keyboard } = this.page;
    const start = Date.now();
    const liked = (heldMs: number) =>
      tally.counting ? tally.count : Math.round((heldMs / 1000) * GUESSED_LIKES_PER_SECOND);
    let tooFast = false;
    await keyboard.down('z');
    try {
      while (liked(Date.now() - start) < likes && Date.now() - start < MAX_LIKE_MS) {
        await this.page.waitForTimeout(LIKE_REPEAT_MS);
        if (await this.saysTooFast()) {
          tooFast = true;
          break;
        }
        tally.see(await this.likeCounter());
        await keyboard.down('z');
      }
    } finally {
      await keyboard.up('z').catch(() => {});
    }
    const heldMs = Date.now() - start;
    // The likes of the last keydowns may show only now.
    tally.see(await this.likeCounter());
    return { liked: liked(heldMs), heldMs, tooFast };
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

  /**
   * Sends today's 粉丝团灯牌. The header's 粉丝团 button is found by its icon, as its words take
   * turns with 「今日任务」; when the streamer isn't followed yet, 「关注」 shows in its place and is
   * clicked first. Then the panel is opened, up to FANS_PANEL_TRIES times (see tryFansPanel): a
   * 「我知道了」 notice that doesn't go away when clicked can keep it from the 灯牌, and a panel
   * opened again may not show it. It joins the 粉丝团 at most once, over all the tries.
   */
  async sendFansLamp(): Promise<'sent' | 'already'> {
    await this.closeFansPanel();
    const bar = this.page.locator('#room_info_bar');
    const follow = bar.locator('button').filter({ hasText: /^关注/ }).first();
    if (await follow.isVisible().catch(() => false)) await follow.click();
    const fans = bar
      .locator('button')
      .filter({ has: this.page.locator('[filter*="fansIconBg"]') })
      .first();
    const state = { joined: false };
    for (let i = 0; i < FANS_PANEL_TRIES; i++) {
      const result = await this.tryFansPanel(fans, state);
      if (result) return result;
    }
    throw new Error('粉丝团面板里没找到送灯牌');
  }

  /**
   * Opens the 粉丝团 panel once, for FANS_PANEL_MS at most. The panel (Lynx, in a frame of its own)
   * may open on a 「我知道了」 notice, closed whenever it shows; to a viewer not in the 粉丝团 yet it
   * offers FANS_JOIN_BUTTON (1 diamond), clicked unless `state.joined`; then it has
   * FANS_LAMP_BUTTON to click, or FANS_LAMP_SENT when today's is already sent (`sent` if it was
   * joining that sent it). Null when it showed neither in time. The panel is closed afterwards, by
   * its ×: Escape doesn't close it, and a panel left open would make the next click on 粉丝团
   * close it instead.
   */
  private async tryFansPanel(
    fans: Locator,
    state: { joined: boolean },
  ): Promise<'sent' | 'already' | null> {
    await fans.click({ timeout: 15_000 });
    try {
      const until = Date.now() + FANS_PANEL_MS;
      while (Date.now() < until) {
        await this.page.waitForTimeout(500);
        for (const frame of this.page.frames()) {
          const notice = frame.getByText('我知道了', { exact: true });
          if (await notice.count().catch(() => 0)) {
            await notice
              .first()
              .click()
              .catch(() => {});
            continue;
          }
          const join = frame.locator('x-text').filter({ hasText: FANS_JOIN_BUTTON });
          if (!state.joined && (await join.count().catch(() => 0))) {
            await join.first().click();
            state.joined = true;
            continue;
          }
          const send = frame.locator('x-text').filter({ hasText: FANS_LAMP_BUTTON });
          if (await send.count().catch(() => 0)) {
            await send.first().click();
            return 'sent';
          }
          if (
            await frame
              .getByText(FANS_LAMP_SENT)
              .count()
              .catch(() => 0)
          )
            return state.joined ? 'sent' : 'already';
        }
      }
      return null;
    } finally {
      await this.page.waitForTimeout(1500);
      await this.closeFansPanel();
    }
  }

  /** Clicks the × of the panel on the right (the 粉丝团 one, among others), if one is open. */
  private async closeFansPanel(): Promise<void> {
    const close = this.page
      .locator('#__living_right_panel_id svg')
      .filter({ has: this.page.locator('[filter*="close_svg"]') })
      .first();
    if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
  }

  /** Whether the page shows Douyin's 手速太快了, its notice for liking too fast. */
  private saysTooFast(): Promise<boolean> {
    return this.page
      .evaluate(() => document.body.innerText.includes('手速太快了'))
      .catch(() => false);
  }

  /** Where the player is: the page's largest video, else its largest canvas; null for neither. */
  private playerBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    // No named functions in here: tsx (esbuild's keepNames) would add a __name the page lacks.
    return this.page.evaluate(() => {
      for (const selector of ['video', 'canvas']) {
        let best: { x: number; y: number; width: number; height: number } | null = null;
        for (const el of document.querySelectorAll(selector)) {
          const r = el.getBoundingClientRect();
          const x = Math.max(r.left, 0);
          const y = Math.max(r.top, 0);
          const width = Math.min(r.right, innerWidth) - x;
          const height = Math.min(r.bottom, innerHeight) - y;
          if (width > 0 && height > 0 && (!best || width * height > best.width * best.height)) {
            best = { x, y, width, height };
          }
        }
        // Anything small is an avatar or a gift animation, not the player.
        if (best && best.width * best.height > innerWidth * innerHeight * 0.1) return best;
      }
      return null;
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.page
      .context()
      .close()
      .catch(() => {});
  }
}
