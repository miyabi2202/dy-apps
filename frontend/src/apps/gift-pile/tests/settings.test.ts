import { PILE } from '../core/config';
import { parseSide, SIZE_RANGE, sizeStore } from '../settings';

describe('parseSide', () => {
  it('takes whole numbers within each side’s own range', () => {
    expect(parseSide('width', '900')).toBe(900);
    expect(parseSide('width', '901')).toBeNull();
    expect(parseSide('height', '2000')).toBe(2000);
    expect(parseSide('height', String(SIZE_RANGE.height.min - 1))).toBeNull();
    expect(parseSide('width', '12.5')).toBeNull();
    expect(parseSide('width', '')).toBeNull();
    expect(parseSide('width', '-100')).toBeNull();
  });
});

describe('sizeStore', () => {
  afterEach(() => localStorage.clear());

  it('round-trips a size and falls back on one that is out of range or malformed', () => {
    sizeStore.write({ width: 640, height: 480 });
    expect(sizeStore.read()).toEqual({ width: 640, height: 480 });

    localStorage.setItem(sizeStore.key, JSON.stringify({ width: 5000, height: 480 }));
    expect(sizeStore.read()).toEqual(PILE.world);

    localStorage.setItem(sizeStore.key, '{not json');
    expect(sizeStore.read()).toEqual(PILE.world);
  });
});
