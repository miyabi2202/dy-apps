import { unread } from '../../../src/core/chat/reading';

const chats = (...lines: [string, string][]) =>
  lines.map(([nickname, content]) => ({ nickname, content }));

test('marks the chat the streamer reads out, misheard, with words missing, or in parts', () => {
  // 都 heard as 的, and the two halves found one after the other.
  expect(
    unread(
      '新版本的多久了你为什么发老资料哈哈哈哈',
      chats(['黑听的', '@默认关闭 新版本都多久了 你为什么发老资料']),
    ),
  ).toBe('（念了黑听的的弹幕）哈哈哈哈');
  // 了 in 来了 is le, as in the chat; the emoji is no matter.
  expect(
    unread('切了个小号我又来了呢小号谁切的', chats(['小望亲', '切了个小号我又来了捏[看]'])),
  ).toBe('（念了小望亲的弹幕）呢小号谁切的');
  expect(
    unread('这么狠毒的话你怎么说得出来', chats(['阿明', '今晚吃火锅'], ['黑听的', '这么狠毒的话'])),
  ).toBe('（念了黑听的的弹幕）你怎么说得出来');
});

test('leaves what the streamer says themselves, and has nothing when it was only reading', () => {
  expect(unread('对啊中岛爱不小众啊', chats(['风烟', '超时空要塞还不小众[看]']))).toBe(
    '对啊中岛爱不小众啊',
  );
  // 的 left out by the recognizer.
  expect(
    unread('不会把自己聊天记录喂了吧', chats(['黑听的', '不会把自己的聊天记录 喂了吧'])),
  ).toBeNull();
  // Too short to tell from chance.
  expect(unread('好了我们唱下一首', chats(['阿明', '好了']))).toBe('好了我们唱下一首');
});
