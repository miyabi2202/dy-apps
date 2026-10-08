import { Shaker } from '../render/shake';

const length = (o: { x: number; y: number }) => Math.hypot(o.x, o.y);

describe('Shaker', () => {
  it('starts at the amplitude and dies away to nothing over its time', () => {
    const shaker = new Shaker();
    shaker.add(10, 400, 1000);
    expect(length(shaker.at(1000))).toBeCloseTo(10);
    // Halfway through it is (1 - 1/2)² of the amplitude.
    expect(length(shaker.at(1200))).toBeCloseTo(2.5);
    expect(length(shaker.at(1399))).toBeLessThan(0.05);
    expect(length(shaker.at(1400))).toBe(0);
  });

  it('gives the same shake for the same time, whatever was asked in between', () => {
    const a = new Shaker();
    const b = new Shaker();
    a.add(8, 500, 0);
    b.add(8, 500, 0);
    const first = { ...a.at(123) };
    b.at(50);
    b.at(300);
    expect({ ...b.at(123) }).toEqual(first);
  });

  it('never moves further than the clamp however many bursts pile up', () => {
    const shaker = new Shaker();
    for (let k = 0; k < 20; k++) shaker.add(30, 1000, 0);
    for (let now = 0; now < 500; now += 16) {
      expect(length(shaker.at(now))).toBeLessThanOrEqual(24 + 1e-9);
    }
    expect(length(shaker.at(0))).toBeCloseTo(24);
    // A single weak one is left alone.
    const weak = new Shaker();
    weak.add(5, 1000, 0);
    expect(length(weak.at(0))).toBeCloseTo(5);
  });

  it('drops expired bursts, and ignores empty ones', () => {
    const shaker = new Shaker();
    shaker.add(10, 100, 0);
    shaker.add(0, 100, 0);
    shaker.add(10, 0, 0);
    shaker.add(-3, 100, 0);
    expect(length(shaker.at(100))).toBe(0);
    shaker.add(6, 200, 1000);
    expect(length(shaker.at(1000))).toBeCloseTo(6);
  });

  it('stops at once on clear, and reuses its offset object', () => {
    const shaker = new Shaker();
    shaker.add(10, 1000, 0);
    const offset = shaker.at(10);
    expect(length(offset)).toBeGreaterThan(0);
    shaker.clear();
    expect(shaker.at(20)).toBe(offset);
    expect(offset).toEqual({ x: 0, y: 0 });
  });
});
