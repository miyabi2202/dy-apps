import type { DyhubCommentEvent, DyhubGiftEvent, DyhubUser } from '@dy-apps/services';
import { chatFrom, giftFrom, userIdOf as idIn } from '../src/adapters/dyhub-events';

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

test('in a 私密 room, viewers, who all share one id, are told apart by nickname and wealth level', () => {
  const hidden = (nickname: string, payLevel?: number) => ({ id: '111111', nickname, payLevel });
  const userIdOf = (user: DyhubUser) => idIn(user, true);

  expect(userIdOf(hidden('苦***', 31))).toBe('111111-82e6_2a_2a_2a-31');
  expect(userIdOf(hidden('🌈***', 21))).toBe('111111-1f308_2a_2a_2a-21');
  expect(userIdOf(hidden('🌈***', 23))).not.toBe(userIdOf(hidden('🌈***', 21)));
  expect(userIdOf(hidden('香***', 31))).not.toBe(userIdOf(hidden('苦***', 31)));
  expect(userIdOf(hidden('用***'))).toBe('111111-7528_2a_2a_2a-0');
  expect(userIdOf({ id: 'u-阿明', nickname: '阿明', payLevel: 21 })).toBe('u-阿明');
});

test('outside a 私密 room, ids are kept as they are', () => {
  expect(idIn({ id: '111111', nickname: '苦***', payLevel: 31 }, false)).toBe('111111');
});
