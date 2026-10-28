import { LikeTally } from '../src/like-tally';

function tally(before: number | null, shown: (number | null)[]): LikeTally {
  const t = new LikeTally(before);
  for (const n of shown) t.see(n);
  return t;
}

test('counts up with the counter, from nothing before pressing', () => {
  expect(tally(null, [null, 6, 11, null, 16, 22]).count).toBe(22);
});

test('adds up the runs when the counter starts again partway', () => {
  expect(tally(null, [40, 90, 1, 30]).count).toBe(120);
});

test('counts only what comes after a counter that was already showing, left over or going on', () => {
  expect(tally(22, [22, 1, 5]).count).toBe(5);
  expect(tally(22, [25, 30]).count).toBe(8);
});

test('says whether the counter ever showed, so the caller can guess from the time instead', () => {
  expect(tally(null, [null, null]).counting).toBe(false);
  expect(tally(null, [null, 3]).counting).toBe(true);
});
