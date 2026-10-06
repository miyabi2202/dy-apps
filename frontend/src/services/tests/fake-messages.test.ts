import { createFakeGift, createFakeMessage } from '../fake-messages';
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
  it('makes a priced gift from a fake viewer, picked by the given random source', () => {
    const gift = createFakeGift({ random: () => 0, now: () => 42 });
    expect(gift).toMatchObject({
      text: '',
      ts: 42,
      gift: { name: '小心心', count: 1, diamonds: 1 },
    });
    expect(gift.user.nickname).toBe('奶茶不加糖');
    expect(createFakeGift().id).not.toBe(createFakeGift().id);
  });

  it('never sends more than 13 嘉年华 at once', () => {
    // The last gift kind and the biggest combo.
    const gift = createFakeGift({ random: () => 0.999 });
    expect(gift.gift).toMatchObject({ name: '嘉年华', count: 13 });
  });
});
