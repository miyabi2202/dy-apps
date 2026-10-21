import type { DyhubCommentEvent, DyhubGiftEvent } from '@dy-apps/services';
import { chatFrom, giftFrom } from '../src/adapters/dyhub-events';

test('keeps only the picked @mentions of a chat, and names an anonymous sender', () => {
  const event: DyhubCommentEvent = {
    id: 'm1',
    roomId: '1',
    type: 'chat',
    ts: 5,
    data: {
      content: '@小助手 在吗',
      parts: [
        { type: 'mention', text: '@小助手', userId: 'bot-1' },
        { type: 'text', text: ' 在吗' },
      ],
    },
  };

  expect(chatFrom(event)).toEqual({
    ts: 5,
    userId: undefined,
    nickname: '匿名',
    content: '@小助手 在吗',
    mentions: [{ text: '@小助手', userId: 'bot-1' }],
  });
});

test('a gift is worth its count times its diamonds, and needs someone to credit', () => {
  const event: DyhubGiftEvent = {
    id: 'g1',
    roomId: '1',
    type: 'gift',
    ts: 5,
    user: { id: 'u-阿明', nickname: '阿明' },
    data: { giftId: 'rose', giftName: '玫瑰', diamondCount: 10 },
  };

  expect(giftFrom(event, 2)).toEqual({
    userId: 'u-阿明',
    nickname: '阿明',
    name: '玫瑰',
    count: 2,
    diamonds: 20,
  });
  expect(giftFrom(event, 0)).toBeNull();
  expect(giftFrom({ ...event, user: undefined }, 2)).toBeNull();
});

test("passes on the badges by the sender's name, when DyHub sends them", () => {
  const event: DyhubCommentEvent = {
    id: 'm2',
    roomId: '1',
    type: 'chat',
    ts: 6,
    user: { id: '7', nickname: '阿明', badges: ['V年'] },
    data: { content: '讲讲曲面积分' },
  };
  expect(chatFrom(event).badges).toEqual(['V年']);
  expect(chatFrom({ ...event, user: { id: '7', nickname: '阿明' } })).not.toHaveProperty('badges');
});
