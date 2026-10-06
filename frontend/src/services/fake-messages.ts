/** Made-up viewers, chat and gifts, for previewing without a live room. */
import type { DanmakuGift, DanmakuMessage, DanmakuUser } from './live-message';

const NICKNAMES = [
  '奶茶不加糖',
  '夜猫子小王',
  '今天也要早睡',
  '摸鱼大师',
  '橘子汽水',
  '路过的程序员',
  '芝士就是力量',
  '一只咸鱼',
  '月亮不睡我不睡',
  '快乐小狗',
  '风吹麦浪',
  '吃瓜群众',
  'Luna',
  '阿杰',
  '小透明',
  '番茄炒蛋',
  '星河滚烫',
  '早八人',
  // Long names, to check that they're cut short without pushing the badge out.
  '今天也是努力搬砖争取早日实现财务自由的打工人',
  '一个名字特别特别特别长的路过观众',
  'SuperLongNicknameThatNeverEndsAndKeepsGoing',
  '春眠不觉晓处处闻啼鸟夜来风雨声花落知多少',
];

/** Rough diamond prices; the demo has no icons, so cards show 🎁. */
const GIFT_DIAMONDS: Record<string, number> = {
  小心心: 1,
  玫瑰: 1,
  人气票: 1,
  你最好看: 2,
  棒棒糖: 9,
  鲜花: 10,
  加油鸭: 15,
  嘉年华: 30000,
};

/** About two thirds of the fake viewers are in the fan club, at levels spread over 1–25. */
const USERS: ReadonlyMap<string, DanmakuUser> = new Map(
  NICKNAMES.map((nickname, i) => [
    nickname,
    {
      id: `demo-user-${i}`,
      nickname,
      fansClub: i % 3 === 2 ? undefined : { name: '弹幕墙', level: ((i * 7) % 25) + 1 },
    },
  ]),
);

/** What one fake viewer does: says something, sends a gift, or taps likes. */
type FakeEvent = { user: string } & (
  { text: string } | { gift: string; count: number } | { likes: number }
);

/**
 * Every fake message, written out whole. The first few chats carry Douyin `[名]` emoji
 * codes, so previews show the images. Mostly chat, about one in six a gift (single
 * ones and big combos) and one in eight likes, with the long names mixed in.
 */
const EVENTS: readonly FakeEvent[] = [
  { user: '奶茶不加糖', text: '来了来了！[比心]' },
  { user: '夜猫子小王', text: '主播晚上好～[微笑]' },
  { user: '快乐小狗', likes: 15 },
  { user: '摸鱼大师', text: '666666[666][666]' },
  { user: '橘子汽水', gift: '小心心', count: 1 },
  { user: '今天也要早睡', text: '哈哈哈哈哈哈哈哈[捂脸]' },
  { user: '路过的程序员', text: '这波操作可以的[鼓掌][鼓掌] 👍' },
  { user: '芝士就是力量', text: '前方高能预警' },
  { user: '今天也是努力搬砖争取早日实现财务自由的打工人', text: '第一次来，关注了' },
  { user: '一只咸鱼', text: '主播今天状态好好' },
  { user: '阿杰', gift: '玫瑰', count: 3 },
  { user: '月亮不睡我不睡', text: '刚下班，赶上了吗？' },
  { user: 'Luna', text: '这个背景音乐叫什么名字呀' },
  { user: '吃瓜群众', likes: 3 },
  { user: '风吹麦浪', text: '冲冲冲！' },
  {
    user: '小透明',
    text: '主播能不能讲讲刚才那段是怎么做到的，我真的看了三遍都没看懂，太强了',
  },
  { user: '番茄炒蛋', gift: '棒棒糖', count: 10 },
  { user: '星河滚烫', text: '泪目了 😭' },
  { user: 'SuperLongNicknameThatNeverEndsAndKeepsGoing', text: '求主播唱一首晴天' },
  { user: '早八人', text: '我宣布这是今天最好看的一局' },
  { user: '一个名字特别特别特别长的路过观众', likes: 520 },
  { user: '奶茶不加糖', text: '弹幕护体！' },
  { user: '夜猫子小王', gift: '你最好看', count: 66 },
  { user: '橘子汽水', text: '笑死，根本停不下来' },
  { user: '今天也要早睡', text: '有没有一起熬夜的朋友' },
  { user: '摸鱼大师', text: '打卡 ✅' },
  { user: '春眠不觉晓处处闻啼鸟夜来风雨声花落知多少', gift: '嘉年华', count: 1 },
  { user: '路过的程序员', text: '刚才那个转折我是真没想到，编剧都不敢这么写' },
  { user: '快乐小狗', text: '+1' },
  { user: '芝士就是力量', likes: 99 },
  { user: '一只咸鱼', text: '这个画质好清楚' },
  { user: '阿杰', gift: '加油鸭', count: 188 },
  { user: '月亮不睡我不睡', text: '礼物走一波 🎁' },
  { user: 'Luna', text: '好耶！' },
  { user: '吃瓜群众', gift: '小心心', count: 1314 },
  { user: '风吹麦浪', text: '晚安，明天见' },
];

/** Just the gifts, in the same order, for an app that only reacts to gifts. */
const GIFT_EVENTS = EVENTS.filter((event) => 'gift' in event);

export interface FakeOptions {
  /** Math.random by default; tests pass a fixed sequence. */
  random?: () => number;
  /** Date.now by default. */
  now?: () => number;
}

let seq = 0;

function toMessage(event: FakeEvent, ts: number): DanmakuMessage {
  const user = USERS.get(event.user)!;
  const base = { id: `demo-${ts}-${seq++}`, user, text: '', ts };
  if ('text' in event) return { ...base, text: event.text };
  if ('likes' in event) return { ...base, likes: event.likes };
  const gift: DanmakuGift = {
    name: event.gift,
    count: event.count,
    diamonds: GIFT_DIAMONDS[event.gift],
  };
  return { ...base, gift };
}

const at = <T>(items: readonly T[], n: number): T => items[n % items.length]!;
const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)]!;

/** A fake message picked at random from the list. */
export function createFakeMessage({
  random = Math.random,
  now = Date.now,
}: FakeOptions = {}): DanmakuMessage {
  return toMessage(pick(EVENTS, random), now());
}

/** A fake gift picked at random from the list. */
export function createFakeGift({
  random = Math.random,
  now = Date.now,
}: FakeOptions = {}): DanmakuMessage {
  return toMessage(pick(GIFT_EVENTS, random), now());
}

/** The `n`th fake message in list order, starting over after the last: the same every time. */
export function fakeMessageAt(n: number, now: () => number = Date.now): DanmakuMessage {
  return toMessage(at(EVENTS, n), now());
}

/** The `n`th fake gift in list order. */
export function fakeGiftAt(n: number, now: () => number = Date.now): DanmakuMessage {
  return toMessage(at(GIFT_EVENTS, n), now());
}
