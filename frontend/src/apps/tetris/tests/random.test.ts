import { PIECE_TYPES, BagGenerator } from '../core/pieces';
import { mulberry32, randomInt, sequenceRng } from '../core/random';

describe('random sources', () => {
  it('sequenceRng replays and cycles', () => {
    const rng = sequenceRng([0.1, 0.2]);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([0.1, 0.2, 0.1]);
  });

  it('randomInt never returns n even for a draw of 1', () => {
    expect(randomInt(sequenceRng([1]), 4)).toBe(3);
    expect(randomInt(sequenceRng([0]), 4)).toBe(0);
  });
});

describe('7-bag', () => {
  it('every consecutive bag of 7 contains each piece exactly once', () => {
    const bag = new BagGenerator(mulberry32(7));
    for (let b = 0; b < 50; b += 1) {
      const pieces = Array.from({ length: 7 }, () => bag.next());
      expect([...pieces].sort()).toEqual([...PIECE_TYPES].sort());
    }
  });
});
