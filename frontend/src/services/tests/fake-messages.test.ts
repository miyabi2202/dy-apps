import { createFakeGift, createFakeMessage, fakeGiftAt, fakeMessageAt } from '../fake-messages';
import { hueFor } from '../live-message';

describe('hueFor', () => {
  it('is stable for a user and within 0–359', () => {
    for (const id of ['a', 'user-1', '12345678901234567890', '']) {
      const hue = hueFor(id);
      expect(hue).toBe(hueFor(id));
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(Number.isInteger(hue)).toBe(true);
    }
  });

  it('spreads ids that differ only in their last character', () => {
    const hues = Array.from({ length: 10 }, (_, i) => hueFor(`demo-user-${i}`));
    const sorted = [...hues].sort((a, b) => a - b);
    // Without the golden-angle spread these all landed within a few degrees.
    expect(sorted.at(-1)! - sorted[0]!).toBeGreaterThan(180);
  });
});

describe('createFakeMessage', () => {
  it('makes messages with unique ids from a fixed set of users', () => {
    const messages = Array.from({ length: 200 }, () => createFakeMessage());
    expect(new Set(messages.map((m) => m.id)).size).toBe(200);
    for (const m of messages) {
      // A chat has text; a gift or a run of likes has none, and a count instead.
      if (m.likes !== undefined) {
        expect(m.text).toBe('');
        expect(m.likes).toBeGreaterThan(0);
      } else if (m.gift) {
        expect(m.text).toBe('');
        expect(m.gift.name).not.toBe('');
        expect(m.gift.count).toBeGreaterThan(0);
        expect(m.gift.diamonds).toBeGreaterThan(0);
      } else {
        expect(m.text).not.toBe('');
      }
      expect(m.user.nickname).not.toBe('');
    }
    expect(messages.some((m) => m.gift)).toBe(true);
    expect(messages.some((m) => m.likes)).toBe(true);
    expect(messages.some((m) => m.text)).toBe(true);
    // Same user id → same user (nickname, fan club), so colours and badges stay consistent.
    const users = new Map<string, unknown>();
    for (const { user } of messages) {
      expect(users.get(user.id) ?? user).toEqual(user);
      users.set(user.id, user);
    }
    const levels = messages.map((m) => m.user.fansClub?.level);
    expect(levels).toContain(undefined);
    for (const level of levels.filter((l) => l !== undefined)) {
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(25);
    }
  });
});

describe('createFakeGift', () => {
  it('picks a whole gift from the list with the given random source', () => {
    const gift = createFakeGift({ random: () => 0, now: () => 42 });
    expect(gift).toMatchObject({ text: '', ts: 42, gift: fakeGiftAt(0).gift });
    expect(gift.user).toEqual(fakeGiftAt(0).user);
    expect(createFakeGift().id).not.toBe(createFakeGift().id);
  });
});

describe('fakeMessageAt', () => {
  const summary = (m: ReturnType<typeof fakeMessageAt>) => [
    m.user.id,
    m.text,
    m.gift?.name,
    m.gift?.count,
    m.likes,
  ];

  it('gives the same message for the same n every time, with a fresh id', () => {
    const first = Array.from({ length: 10 }, (_, i) => summary(fakeMessageAt(i)));
    expect(Array.from({ length: 10 }, (_, i) => summary(fakeMessageAt(i)))).toEqual(first);
    expect(new Set(first.map((m) => JSON.stringify(m))).size).toBe(10);
    expect(fakeMessageAt(0).id).not.toBe(fakeMessageAt(0).id);
  });

  it('starts over after the last message', () => {
    const all = Array.from({ length: 200 }, (_, i) => JSON.stringify(summary(fakeMessageAt(i))));
    const length = all.indexOf(all[0]!, 1);
    expect(length).toBeGreaterThan(10);
    expect(all.slice(length, length * 2)).toEqual(all.slice(0, length));
  });

  it('gives fakeGiftAt only the gifts, in the order they come in the list', () => {
    const gifts = Array.from({ length: 200 }, (_, i) => fakeMessageAt(i)).filter((m) => m.gift);
    expect(Array.from({ length: 5 }, (_, i) => summary(fakeGiftAt(i)))).toEqual(
      gifts.slice(0, 5).map(summary),
    );
    expect(gifts.every((m) => m.gift!.diamonds! > 0)).toBe(true);
  });
});
