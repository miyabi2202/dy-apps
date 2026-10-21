import type { GiftEvent, LikeEvent } from '../src/events';
import { GiftCounter, likeCount } from '../src/stream';

describe('GiftCounter', () => {
  const gift = (data: Partial<GiftEvent['data']>, roomId = '1'): GiftEvent => ({
    id: Math.random().toString(),
    roomId,
    type: 'gift',
    ts: 0,
    data: { giftId: '3992', giftName: '人气票', ...data },
  });

  it('counts a single gift once and ignores its closing repeatEnd copy', () => {
    const counter = new GiftCounter();
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 1 }))).toBe(1);
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 1, repeatEnd: true }))).toBe(0);
  });

  it('counts combo progress by increments and drops out-of-order messages', () => {
    const counter = new GiftCounter();
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 1 }))).toBe(1);
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 4 }))).toBe(3);
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 2 }))).toBe(0);
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 5, repeatEnd: true }))).toBe(0);
  });

  it('counts a closing message on its own when the progress messages were missed', () => {
    const counter = new GiftCounter();
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 3, repeatEnd: true }))).toBe(3);
  });

  it('keeps different groups, gifts and rooms apart', () => {
    const counter = new GiftCounter();
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 1 }))).toBe(1);
    expect(counter.add(gift({ groupId: 'g2', repeatCount: 1 }))).toBe(1);
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 1, giftId: '1' }))).toBe(1);
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 1 }, '2'))).toBe(1);
  });

  it('forgets groups after the ttl, and ignores non-gift events', () => {
    let now = 0;
    const counter = new GiftCounter(10_000, () => now);
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 1 }))).toBe(1);
    now = 10_001;
    expect(counter.add(gift({ groupId: 'g1', repeatCount: 1 }))).toBe(1);
    expect(
      counter.add({ id: 'c', roomId: '1', type: 'chat', ts: 0, data: { content: 'hi' } }),
    ).toBe(0);
  });

  it('counts every message when room-feed sends no groupId', () => {
    const counter = new GiftCounter();
    expect(counter.add(gift({}))).toBe(1);
    expect(counter.add(gift({}))).toBe(1);
  });
});

describe('likeCount', () => {
  // data isn't checked: some tests send what a bad sender might.
  // data isn't checked, so a test can send what an older room-feed might.
  const like = (data: Record<string, unknown>) =>
    ({ id: 'l1', roomId: 'r1', type: 'like', ts: 300, data }) as LikeEvent;

  it("reads a like event's taps, counting a missing or bad count as one", () => {
    expect(likeCount(like({ count: 5, total: 100 }))).toBe(5);
    expect(likeCount(like({}))).toBe(1);
    expect(likeCount(like({ count: 0 }))).toBe(1);
    expect(likeCount(like({ count: '5' }))).toBe(1);
  });
});
