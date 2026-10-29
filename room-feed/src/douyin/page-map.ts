/**
 * What we look for on Douyin's live-room page, in one place: when Douyin changes the page,
 * these are what to check. Only what locators use; the texts inside `page.evaluate` (直播已结束,
 * 手速太快了, the like counter) travel with their functions and stay beside them.
 */

/** The size of the window the page is opened in, which decides the layout it gives. */
export const VIEWPORT = { width: 1440, height: 900 };

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
