import { CONFIG } from '../core/config';
import { LikeMeter } from '../core/room/like-meter';

const { firstThreshold, maxThreshold, idleResetMs } = CONFIG.likes;
const a = { id: 'a', name: '阿杰' };
const b = { id: 'b', name: '小美' };

describe('LikeMeter', () => {
  it('fills at the threshold, credits whoever liked most, and carries the rest over', () => {
    const meter = new LikeMeter();
    expect(meter.add(a, firstThreshold - 40, 0)).toEqual([]);
    expect(meter.add(b, 30, 0)).toEqual([]);
    expect(meter.view.top).toEqual({ sender: a, likes: firstThreshold - 40 });
    expect(meter.add(b, 15, 0)).toEqual([
      { threshold: firstThreshold, top: { sender: a, likes: firstThreshold - 40 } },
    ]);
    // The 5 past the threshold are the last liker's.
    expect(meter.view).toEqual({
      likes: 5,
      threshold: firstThreshold * 2,
      top: { sender: b, likes: 5 },
    });
  });

  it('doubles each time up to the cap, even from one big batch', () => {
    const meter = new LikeMeter();
    let total = 0;
    for (let t = firstThreshold; t < maxThreshold; t *= 2) total += t;
    const fills = meter.add(a, total + maxThreshold * 2, 0);
    expect(fills.map((f) => f.threshold)).toEqual([100, 200, 400, 800, 1600, 1600]);
    expect(meter.view).toMatchObject({ likes: 0, threshold: maxThreshold });
  });

  it('starts over at the first threshold after a while without filling', () => {
    const meter = new LikeMeter();
    meter.add(a, firstThreshold + 20, 1000);
    expect(meter.idle(1000 + idleResetMs - 1)).toBe(false);
    expect(meter.idle(1000 + idleResetMs)).toBe(true);
    expect(meter.view).toEqual({ likes: 0, threshold: firstThreshold, top: null });
    // Already empty: nothing to say.
    expect(meter.idle(1000 + idleResetMs * 2)).toBe(false);
  });
});
