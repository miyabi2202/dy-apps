import { Wallet, type StoredWallet } from '../../../src/core/viewers/wallet';

const HOUR = 60 * 60_000;
const ACCOUNTS = { 'u-阿明': { nickname: '阿明', gifted: 5, spent: 1 } };

/** A wallet on `stored`, at the clock `now` points to, and what it last saved. */
function setup(stored: StoredWallet, now: () => number) {
  const saved: StoredWallet[] = [];
  const wallet = new Wallet(
    { load: () => structuredClone(stored), save: (w) => void saved.push(structuredClone(w)) },
    { now },
  );
  return { wallet, saved };
}

test('keeps balances saved within the day, and forgets older ones or ones with no time', () => {
  const now = 100 * HOUR;
  const recent = setup({ accounts: ACCOUNTS, savedAt: now - 23 * HOUR }, () => now).wallet;
  recent.clearIfOlderThan(24 * HOUR);
  expect(recent.balance('u-阿明')).toBe(4);

  for (const savedAt of [now - 25 * HOUR, undefined]) {
    const old = setup({ accounts: ACCOUNTS, savedAt }, () => now).wallet;
    old.clearIfOlderThan(24 * HOUR);
    expect(old.balance('u-阿明')).toBe(0);
  }
});

test('every save, and touch on exit, records when', () => {
  let now = 1000;
  const { wallet, saved } = setup({ accounts: {} }, () => now);
  wallet.credit('u-阿明', '阿明', 3);
  now = 2000;
  wallet.touch();

  expect(saved.map((w) => w.savedAt)).toEqual([1000, 2000]);
  expect(saved.at(-1)?.accounts).toEqual({ 'u-阿明': { nickname: '阿明', gifted: 3, spent: 0 } });
});
