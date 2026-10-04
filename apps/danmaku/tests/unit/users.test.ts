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
      expect(m.text).not.toBe('');
      expect(m.user.nickname).not.toBe('');
    }
    // Same user id → same nickname, so per-user colours stay consistent.
    const names = new Map<string, string>();
    for (const { user } of messages) {
      expect(names.get(user.id) ?? user.nickname).toBe(user.nickname);
      names.set(user.id, user.nickname);
    }
  });
});
