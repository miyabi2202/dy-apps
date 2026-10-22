import { RecentGifts } from '../../../src/core/chat/recent-gifts';

const gift = (name: string) => ({ userId: 'u-1', nickname: '阿明', name, count: 1, diamonds: 1 });

test('keeps the gifts of the last few minutes, at most so many', () => {
  const gifts = new RecentGifts(60_000, 2);
  gifts.add(0, gift('玫瑰'));
  gifts.add(30_000, gift('小心心'));
  gifts.add(40_000, gift('比心'));
  expect(gifts.recent(50_000).map((g) => g.name)).toEqual(['小心心', '比心']);
  expect(gifts.recent(95_000).map((g) => g.name)).toEqual(['比心']);
});
