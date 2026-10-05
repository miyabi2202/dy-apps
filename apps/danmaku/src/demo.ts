import type { DanmakuGift, DanmakuMessage, DanmakuUser } from './types';

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

/** Real Douyin gift names; the demo has no icons, so cards show 🎁. */
const GIFTS = ['小心心', '玫瑰', '人气票', '棒棒糖', '你最好看', '加油鸭', '鲜花', '嘉年华'];

/** Mostly single gifts, sometimes a big combo, to preview both ends. */
const GIFT_COUNTS = [1, 1, 1, 1, 3, 5, 10, 66, 188, 1314];

/** About two thirds of the fake viewers are in the fan club, at levels spread over 1–25. */
const USERS: DanmakuUser[] = NICKNAMES.map((nickname, i) => ({
  id: `demo-user-${i}`,
  nickname,
  fansClub: i % 3 === 2 ? undefined : { name: '弹幕墙', level: ((i * 7) % 25) + 1 },
}));

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

let seq = 0;

/** A random message from a random fake viewer; about one in six is a gift. */
export function createFakeMessage(): DanmakuMessage {
  const ts = Date.now();
  const id = `demo-${ts}-${seq++}`;
  if (Math.random() < 1 / 6) {
    const gift: DanmakuGift = { name: pick(GIFTS), count: pick(GIFT_COUNTS) };
    return { id, user: pick(USERS), text: '', gift, ts };
  }
  return { id, user: pick(USERS), text: pick(TEXTS), ts };
}
