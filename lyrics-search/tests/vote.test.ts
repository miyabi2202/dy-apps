import type { Hit } from '../src/types';
import { decideTitle, vote } from '../src/vote';

const hit = (title: string, artist = '某人', pop = 0): Hit => ({ title, artists: [artist], pop });

describe('vote', () => {
  it('adds 1/(1+rank) per query for a title best rank, once per query', () => {
    const { ranked } = vote([
      [hit('甲'), hit('乙'), hit('乙 (Live)')],
      [hit('丙'), hit('乙')],
    ]);
    // 甲 tops one query (1); 乙 is second in both (0.5 + 0.5); 丙 tops one query (1): a three-way tie.
    expect(ranked).toEqual([
      ['甲', 1],
      ['乙', 1],
      ['丙', 1],
    ]);
  });

  it('ranks a title several queries agree on first, and keeps every hit under its title', () => {
    const { ranked, hitsBy } = vote([[hit('甲甲'), hit('乙乙')], [hit('乙乙 (TV Size)')]]);
    expect(ranked).toEqual([
      ['乙乙', 1.5],
      ['甲甲', 1],
    ]);
    expect(hitsBy.get('乙乙')?.map((h) => h.title)).toEqual(['乙乙', '乙乙 (TV Size)']);
  });

  it('skips titles that normalise to nothing', () => {
    expect(vote([[hit('（伴奏）')]]).ranked).toEqual([]);
  });
});

describe('decideTitle', () => {
  it('is sure with a score of at least 1 and 1.5 times the runner-up', () => {
    expect(
      decideTitle(
        [
          ['甲', 2],
          ['乙', 1],
        ],
        5,
        1,
        1.5,
      ).sure,
    ).toBe(true);
    expect(
      decideTitle(
        [
          ['甲', 1.4],
          ['乙', 1],
        ],
        5,
        1,
        1.5,
      ).sure,
    ).toBe(false);
    expect(decideTitle([['甲', 0.5]], 5, 1, 1.5).sure).toBe(false);
  });

  it('is never sure with fewer than 2 queries, and says why', () => {
    expect(decideTitle([['甲', 2]], 1, 1, 1.5)).toEqual({ sure: false, why: 'too few lines' });
    expect(decideTitle([], 5, 1, 1.5)).toEqual({ sure: false, why: 'no hits' });
    expect(
      decideTitle(
        [
          ['甲', 2],
          ['乙', 1],
        ],
        5,
        1,
        1.5,
      ).why,
    ).toBe('score 2.0 vs 1.0');
  });
});
