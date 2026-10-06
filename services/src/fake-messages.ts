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

const TEXTS = [
  '来了来了！',
  '主播晚上好～',
  '666666',
  '哈哈哈哈哈哈哈哈',
  '这波操作可以的 👍',
  '前方高能预警',
  '第一次来，关注了',
  '主播今天状态好好',
  '刚下班，赶上了吗？',
  '这个背景音乐叫什么名字呀',
  '冲冲冲！',
  '泪目了 😭',
  '求主播唱一首晴天',
  '我宣布这是今天最好看的一局',
  '弹幕护体！',
  '笑死，根本停不下来',
  '有没有一起熬夜的朋友',
  '主播能不能讲讲刚才那段是怎么做到的，我真的看了三遍都没看懂，太强了',
  '打卡 ✅',
  '晚安，明天见',
  '这个画质好清楚',
  '+1',
  '刚才那个转折我是真没想到，编剧都不敢这么写',
  '礼物走一波 🎁',
  '好耶！',
];

/** Douyin gifts with rough diamond prices; the demo has no icons, so cards show 🎁. */
const GIFTS = [
  { name: '小心心', diamonds: 1 },
  { name: '玫瑰', diamonds: 1 },
  { name: '人气票', diamonds: 1 },
  { name: '棒棒糖', diamonds: 9 },
  { name: '你最好看', diamonds: 2 },
  { name: '加油鸭', diamonds: 15 },
  { name: '鲜花', diamonds: 10 },
  { name: '嘉年华', diamonds: 30000 },
];

/** Mostly single gifts, sometimes a big combo, to preview both ends. */
const GIFT_COUNTS = [1, 1, 1, 1, 3, 5, 10, 66, 188, 1314];

/** About two thirds of the fake viewers are in the fan club, at levels spread over 1–25. */
const USERS: DanmakuUser[] = NICKNAMES.map((nickname, i) => ({
  id: `demo-user-${i}`,
  nickname,
  fansClub: i % 3 === 2 ? undefined : { name: '弹幕墙', level: ((i * 7) % 25) + 1 },
}));

export interface FakeOptions {
  /** Math.random by default; tests pass a fixed sequence. */
  random?: () => number;
  /** Date.now by default. */
  now?: () => number;
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)]!;

let seq = 0;

/** How many likes a fake viewer sends before pausing: a few taps, or a long run. */
const LIKE_COUNTS = [1, 3, 8, 15, 30, 99, 520];

/** A random message from a random fake viewer; about one in six is a gift, one in eight likes. */
export function createFakeMessage({
  random = Math.random,
  now = Date.now,
}: FakeOptions = {}): DanmakuMessage {
  const ts = now();
  const id = `demo-${ts}-${seq++}`;
  const roll = random();
  if (roll < 1 / 8) {
    return { id, user: pick(USERS, random), text: '', likes: pick(LIKE_COUNTS, random), ts };
  }
  if (roll < 1 / 8 + 1 / 6) return createFakeGift({ random, now });
  return { id, user: pick(USERS, random), text: pick(TEXTS, random), ts };
}

/** A random gift, of a random size, from a random fake viewer. */
export function createFakeGift({
  random = Math.random,
  now = Date.now,
}: FakeOptions = {}): DanmakuMessage {
  const ts = now();
  const gift: DanmakuGift = { ...pick(GIFTS, random), count: pick(GIFT_COUNTS, random) };
  return { id: `demo-${ts}-${seq++}`, user: pick(USERS, random), text: '', gift, ts };
}
