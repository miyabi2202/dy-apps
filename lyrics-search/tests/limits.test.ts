import { CircuitBreaker, minGap } from '../src/limits';

describe('minGap', () => {
  it('spaces requests asked for at once, and does not wait after a long pause', async () => {
    let clock = 1000;
    const slept: number[] = [];
    const sleep = async (ms: number) => void slept.push(ms);
    const limit = minGap(100, () => clock, sleep);

    await Promise.all([limit(), limit(), limit()]);
    expect(slept).toEqual([100, 200]);

    clock += 5000;
    await limit();
    expect(slept).toEqual([100, 200]);
  });
});

describe('CircuitBreaker', () => {
  it('opens after 3 failures in a row and closes after offMs', () => {
    let clock = 0;
    const breaker = new CircuitBreaker({ failures: 3, offMs: 600_000, now: () => clock });
    breaker.failure();
    breaker.failure();
    expect(breaker.open()).toBe(false);
    breaker.failure();
    expect(breaker.open()).toBe(true);
    clock = 599_999;
    expect(breaker.open()).toBe(true);
    clock = 600_000;
    expect(breaker.open()).toBe(false);
  });

  it('counts only failures in a row', () => {
    const breaker = new CircuitBreaker({ failures: 2, offMs: 1000, now: () => 0 });
    breaker.failure();
    breaker.success();
    breaker.failure();
    expect(breaker.open()).toBe(false);
  });
});
