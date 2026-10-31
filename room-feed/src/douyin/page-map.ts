/**
 * What we look for on Douyin's live-room page, in one place: when Douyin changes the page,
 * these are what to check. Only what locators use; the texts inside `page.evaluate` (直播已结束,
 * 手速太快了, the like counter) travel with their functions and stay beside them.
 */

/** The size of the window the page is opened in, which decides the layout it gives. */
export const VIEWPORT = { width: 1440, height: 900 };

/**
 * How long a step on the page waits for what it acts on, in ms (Playwright's `timeout`), and the
 * settling after it loads. A target that doesn't show in time throws.
 */
export const PAGE_WAIT = {
  /** Opening the room's address, until its HTML is in. */
  load: 45_000,
  /** The page's title, which shows it has started to render. */
  title: 15_000,
  /** The page settling after its title is there, before the click that starts the player. */
  settle: 2500,
  /** The enter answer, which says whether the room is streaming, before the page's own words do. */
  enter: 15_000,
  /** The 粉丝团 button, the gift bar's 更多 and the gift panel to show, or the 粉丝团 button to click. */
  panel: 15_000,
  /** One step in the gift panel (更多, the search, a gift) for its target. */
  giftStep: 10_000,
  /** The chat box to show. */
  chatBox: 5000,
  /** The click on the chat box, before falling back to focusing it. */
  chatBoxClick: 3000,
  /** A × (the right panel's, the download popup's) to click. */
  close: 5000,
  /** The gift bar's 充值 to read the balance from. */
  balance: 2000,
};

/** Where the click that starts a headless player lands (and opens the chat socket). */
export const PLAYER_CLICK = { x: 720, y: 450 };

/** The chat box: Douyin's Slate editor, found by attributes that survive its class-name hashing. */
export const CHAT_INPUT =
  '[data-e2e="live-chatting"] [data-slate-editor="true"][contenteditable="true"]';

/** The bar above the player with the streamer's name, 「关注」 and the 粉丝团 button. */
export const ROOM_INFO_BAR = '#room_info_bar';

/** The header's follow button, which shows only while the streamer isn't followed. */
export const FOLLOW_BUTTON = /^关注/;

/** The icon that marks the header's 粉丝团 button, whose class names are hashed. */
export const FANS_ICON = '[filter*="fansIconBg"]';

/** The 粉丝团 panel is Lynx, which draws all its text in `x-text` elements. */
export const PANEL_TEXT = 'x-text';

/** The button of the notices the panel shows now and then (a rule, a reminder) that closes them. */
export const NOTICE_OK_TEXT = '我知道了';

/** The panel on the right, where the 粉丝团 and others open: its close icon's svg. */
export const RIGHT_PANEL_CLOSE_SVG = '#__living_right_panel_id svg';

/** What marks that svg as the close icon (×). */
export const CLOSE_ICON = '[filter*="close_svg"]';

/** The 粉丝团 panel's button that sends the 灯牌 (its words differ between accounts). */
export const FANS_LAMP_BUTTON = /^(送灯牌|送出粉丝灯牌)$/;

/** The panel's button for joining the 粉丝团 (1 diamond), shown instead of the 灯牌 to a viewer not in it yet. */
export const FANS_JOIN_BUTTON = /^加入粉丝团$/;

/** The panel's line once today's 灯牌 is sent: 「今日第7位送灯牌，连续3天」. */
export const FANS_LAMP_SENT = /今日第\d+位送灯牌/;

/**
 * The × of Douyin's 「下载电脑客户端」 popup: the svg beside its download container. The popup is in
 * the page all along, at 0×0 until it shows.
 */
export const DOWNLOAD_GUIDE_CLOSE = ':has(> [data-e2e="download-container"]) > svg';

/** The gift bar's 「更多」, which opens the gift panel on the right. */
export const GIFTS_MORE = '[data-e2e="gifts-switch"]';

/** The gift panel on the right, with its tabs (推荐, 背包, …), search and gift tiles. */
export const GIFT_PANEL = '[data-e2e="__right_gift_panel__"]';

/** The panel's search icon: the extra slot at the end of its tab bar. */
export const GIFT_SEARCH_ICON = '.semi-tabs-bar-extra svg';

/** The panel's search box (「搜索礼物名称或价格」). */
export const GIFT_SEARCH_INPUT = 'input';

/** One gift tile in the panel; clicking one sends it at once. */
export const GIFT_TILE = '.gift_item_gift_grid';

/** The gift bar's 充值 slot, whose text is the account's diamonds. */
export const DIAMOND_BALANCE = '[data-e2e="recharge-btn"]';
