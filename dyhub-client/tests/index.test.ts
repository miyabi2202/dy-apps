import {
  dyhubUrl,
  GiftCounter,
  isRoomId,
  parsePort,
  type DyhubEvent,
  type DyhubGiftData,
} from '../src/index';

describe('dyhub settings', () => {
  it('accepts ports 1–65535 written as plain digits', () => {
    expect(parsePort('8757')).toBe(8757);
    expect(parsePort('1')).toBe(1);
    expect(parsePort('65535')).toBe(65535);
    for (const bad of ['', '0', '65536', '87.5', '-1', ' 8757', 'abc']) {
      expect(parsePort(bad)).toBeNull();
    }
  });

  it('accepts room numbers made of digits only', () => {
    expect(isRoomId('167920210669')).toBe(true);
    for (const bad of ['', '1679 2021', 'abc', 'live.douyin.com/1']) {
      expect(isRoomId(bad)).toBe(false);
    }
  });

  it('always targets localhost with the chat and gift streams', () => {
    expect(dyhubUrl(8757, '167920210669')).toBe(
      'ws://localhost:8757/ws?roomId=167920210669&types=chat,gift',
    );
  });
});

describe('GiftCounter', () => {
  const gift = (data: Partial<DyhubGiftData>, roomId = '1'): DyhubEvent => ({
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

  it('counts every message when DyHub sends no groupId', () => {
    const counter = new GiftCounter();
    expect(counter.add(gift({}))).toBe(1);
    expect(counter.add(gift({}))).toBe(1);
  });
});
