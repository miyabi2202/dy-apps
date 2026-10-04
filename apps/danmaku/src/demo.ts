import type { DanmakuMessage, DanmakuUser } from './types';

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

/** About two thirds of the fake viewers are in the fan club, at levels spread over 1–25. */
const USERS: DanmakuUser[] = NICKNAMES.map((nickname, i) => ({
  id: `demo-user-${i}`,
  nickname,
  fansClub: i % 3 === 2 ? undefined : { name: '弹幕墙', level: ((i * 7) % 25) + 1 },
}));

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

let seq = 0;

/** A random message from a random fake viewer. */
export function createFakeMessage(): DanmakuMessage {
  const ts = Date.now();
  return { id: `demo-${ts}-${seq++}`, user: pick(USERS), text: pick(TEXTS), ts };
}
