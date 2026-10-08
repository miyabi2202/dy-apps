import { PILE } from '../core/config';
import { PileState } from '../render/pile-state';
import { HOLE, RestingOrder } from '../render/gl/resting-order';
import { frame, mulberry32 } from './helpers';

const CAPACITY = 600;
const CULLED = Math.fround(HOLE);

const newState = () =>
  new PileState(PILE, { world: PILE.world, heapAgeMs: 100, releaseBand: 34, landedSpeed: 300 });

/** An icon's position, from its id alone, so a buffer entry says which icon it is. */
const at = (id: number): [number, number] => [id, 2 * id + 1];
const settle = (...ids: number[]): [number, number, number][] => ids.map((id) => [id, ...at(id)]);

/**
 * A stand-in for the GPU's resting buffer that is sent what `RestingOrder` says to send, and
 * remembers how many times each icon's position went out on its own (not in a full resend).
 */
class FakeBuffer {
  readonly xy = new Float32Array(2 * CAPACITY).fill(NaN);
  readonly sentAlone = new Map<number, number>();
  resends = 0;

  constructor(
    private readonly order: RestingOrder,
    private readonly state: PileState,
  ) {}

  /** One draw: plan, then send. */
  draw(): void {
    const { holes, from, to } = this.order.plan(this.state.restingCount);
    for (const g of holes) this.xy.fill(HOLE, 2 * g, 2 * g + 2);
    if (to <= from) return;
    const full = from === 0 && holes.length === 0;
    const packed = this.order.pack(this.state.restingXy, from, to);
    this.xy.set(packed, 2 * from);
    if (full) {
      this.resends++;
      this.sentAlone.clear();
      return;
    }
    for (let k = 0; k < to - from; k++) {
      const x = packed[2 * k]!;
      if (x !== CULLED) this.sentAlone.set(x, (this.sentAlone.get(x) ?? 0) + 1);
    }
  }

  /** The ids drawn, bottom to top, holes left out (an icon's x is its id; see `at`). */
  drawnIds(): number[] {
    const ids: number[] = [];
    for (let g = 0; g < this.order.length; g++) {
      if (this.xy[2 * g] !== CULLED) ids.push(this.xy[2 * g]!);
    }
    return ids;
  }
}

/** The state, its order and the buffer they feed, with `ids` already settled and drawn. */
function pileOf(ids: number[], capacity = CAPACITY) {
  const state = newState();
  const order = new RestingOrder(capacity);
  const buffer = new FakeBuffer(order, state);
  state.apply(frame({ settled: settle(...ids) }), 0);
  order.apply(state.journal);
  buffer.draw();
  return { state, order, buffer };
}

describe('RestingOrder', () => {
  it('draws exactly the resting set, in the order it settled, through random settling, taking and restarting', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rng = mulberry32(seed);
      const state = newState();
      const order = new RestingOrder(CAPACITY);
      const buffer = new FakeBuffer(order, state);
      /** Resting ids in the order they settled. */
      let settleOrder: number[] = [];
      let next = 0;
      let generation = 0;
      let resends = 0;
      for (let step = 0; step < 600; step++) {
        if (rng() < 0.01) {
          generation++;
          settleOrder = [];
        }
        const settled: [number, number, number][] = [];
        const room = CAPACITY - settleOrder.length;
        for (let k = Math.min(room, Math.floor(rng() * 2)); k > 0; k--) {
          settled.push(...settle(next));
          settleOrder.push(next++);
        }
        const woken: number[] = [];
        for (let k = Math.floor(rng() * 3); k > 0; k--) {
          const id = settleOrder[Math.floor(rng() * settleOrder.length)];
          if (id !== undefined && !woken.includes(id)) woken.push(id);
        }
        state.apply(frame({ generation, settled, woken }), step);
        settleOrder = settleOrder.filter((id) => !woken.includes(id));
        // The user takes one, out of the resting set at once.
        if (rng() < 0.2 && settleOrder.length > 0) {
          const id = settleOrder[Math.floor(rng() * settleOrder.length)]!;
          state.take(id);
          settleOrder = settleOrder.filter((other) => other !== id);
        }
        order.apply(state.journal);
        // A draw per frame, one icon settling at most: see the `failing` test for what more does.
        {
          const before = buffer.resends;
          buffer.draw();
          resends += buffer.resends - before;
          expect(state.restingCount).toBe(settleOrder.length);
          expect(buffer.drawnIds()).toEqual(settleOrder);
          for (const id of settleOrder) {
            const slot = state.slotOf(id)!;
            const g = order.bufferSlotOf(slot);
            expect(order.slotAt(g)).toBe(slot);
            expect([buffer.xy[2 * g], buffer.xy[2 * g + 1]]).toEqual(at(id));
          }
        }
      }
      // The run did go through full resends (compaction), not just the first fill.
      expect(resends).toBeGreaterThan(0);
    }
  });

  // Known flaw, left as it was: icons swap-filled into a slot before they were sent go to the
  // end of the buffer ahead of those that settled before them but weren't sent either, so the
  // later settler is drawn underneath. Remove `.failing` when it is fixed.
  it.failing('keeps the settle order of icons not yet sent when a removal swap-fills one', () => {
    const { state, order, buffer } = pileOf([0, 1]);
    state.apply(frame({ settled: settle(2, 3, 4) }), 1);
    state.take(1);
    state.take(2); // 4, the latest, fills 2's slot
    order.apply(state.journal);
    buffer.draw();
    expect(buffer.drawnIds()).toEqual([0, 3, 4]);
  });

  it('keeps the order of the icons it compacts, and sends the whole buffer again', () => {
    const ids = Array.from({ length: 560 }, (_, k) => k);
    const { state, order, buffer } = pileOf(ids);
    expect(order.length).toBe(560);
    // Take every other one but the last: over 256 holes and a quarter of the buffer, so the next draw compacts.
    const gone = ids.filter((id) => id % 2 === 0 && id < 558);
    for (const id of gone) state.take(id);
    order.apply(state.journal);
    const before = buffer.resends;
    buffer.draw();
    expect(buffer.resends).toBe(before + 1);
    const left = ids.filter((id) => !gone.includes(id));
    expect(order.length).toBe(left.length);
    expect(buffer.drawnIds()).toEqual(left);
  });

  it('sends an icon swap-filled before it was sent once, at the end, and culls the hole it left', () => {
    const { state, order, buffer } = pileOf([0, 1, 2, 3]);
    // 4 and 5 settle, then 4 goes before they were ever sent: 5 swap-fills its slot.
    state.apply(frame({ settled: settle(4, 5) }), 1);
    state.take(4);
    // And 1 goes: 5 moves again, into slot 1, and has still not been sent.
    state.take(1);
    order.apply(state.journal);
    expect(state.slotOf(5)).toBe(1);
    const before = buffer.resends;
    buffer.draw();
    expect(buffer.resends).toBe(before);
    expect(buffer.drawnIds()).toEqual([0, 2, 3, 5]);
    expect(buffer.sentAlone.get(5)).toBe(1);
    // 1's buffer slot is a hole, not a copy of 5.
    expect(buffer.xy[2]).toBe(CULLED);
    // With nothing changed, nothing is sent.
    expect(order.plan(state.restingCount)).toEqual({ holes: [], from: 5, to: 5 });
  });

  it('leaves an icon that was on the GPU where it is when a removal swap-fills a slot with it', () => {
    const { state, order } = pileOf([0, 1, 2, 3]);
    state.take(0); // 3 fills slot 0
    order.apply(state.journal);
    expect(order.plan(state.restingCount)).toEqual({ holes: [0], from: 4, to: 4 });
    expect(order.bufferSlotOf(state.slotOf(3)!)).toBe(3);
    expect(order.slotAt(3)).toBe(0);
  });

  it('sends everything again after invalidate, and starts empty on a new generation', () => {
    const { state, order } = pileOf([0, 1, 2]);
    order.invalidate();
    expect(order.plan(state.restingCount)).toEqual({ holes: [], from: 0, to: 3 });
    state.apply(frame({ generation: 1, settled: settle(9) }), 1);
    order.apply(state.journal);
    expect(order.plan(state.restingCount)).toEqual({ holes: [], from: 0, to: 1 });
    expect(order.slotAt(0)).toBe(0);
  });

  it('keeps to its capacity when more settle than fit', () => {
    const { order } = pileOf([0, 1, 2, 3, 4, 5], 4);
    expect(order.length).toBe(4);
  });
});
