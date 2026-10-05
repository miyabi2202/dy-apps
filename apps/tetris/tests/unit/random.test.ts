import { PIECE_TYPES, BagGenerator } from '../../src/core/pieces';
import { mulberry32, randomInt, sequenceRng } from '../../src/core/random';

describe('random sources', () => {
  it('mulberry32 is reproducible for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

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

  it('is reproducible from the same seed', () => {
    const a = new BagGenerator(mulberry32(9));
    const b = new BagGenerator(mulberry32(9));
    const seqA = Array.from({ length: 28 }, () => a.next());
    const seqB = Array.from({ length: 28 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
});
