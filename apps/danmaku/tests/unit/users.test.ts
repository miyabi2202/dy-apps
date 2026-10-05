import { createFakeMessage } from '../../src/demo';
import { hueFor } from '../../src/types';

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
    const messages = Array.from({ length: 200 }, createFakeMessage);
    expect(new Set(messages.map((m) => m.id)).size).toBe(200);
    for (const m of messages) {
      // A chat has text; a gift has none, and a name and a positive count instead.
      if (m.gift) {
        expect(m.text).toBe('');
        expect(m.gift.name).not.toBe('');
        expect(m.gift.count).toBeGreaterThan(0);
      } else {
        expect(m.text).not.toBe('');
      }
      expect(m.user.nickname).not.toBe('');
    }
    expect(messages.some((m) => m.gift)).toBe(true);
    expect(messages.some((m) => !m.gift)).toBe(true);
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
