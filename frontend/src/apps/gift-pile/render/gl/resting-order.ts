import { type ChangeJournal, REMOVED_STRIDE } from '../pile-state';

/** Where a hole in the resting buffer is: far above any view, so the shader culls it. */
export const HOLE = -1e30;

/** What to send the GPU's resting buffer to bring it up to date. */
export interface RestingUpload {
  /** Buffer slots that became holes: send each `HOLE` (none when the whole range is sent). */
  holes: number[];
  /** The buffer slots [from, to) to send from the state's positions; empty when `to <= from`. */
  from: number;
  to: number;
}

/**
 * The order of the pile's resting icons in the GPU buffer, apart from any GPU object.
 *
 * The buffer keeps icons in the order they settled and never reorders them: overlapping
 * icons are drawn in buffer order, so swap-filling a slot (as the state does) would send an
 * icon behind its neighbours. A removal leaves a hole (`HOLE`, culled by the shader) and the
 * buffer is compacted, keeping its order, once holes are many.
 * `gpuOf[stateSlot]` is where a state slot's icon is in the buffer (-1: not sent yet), and
 * `stateOf[gpuSlot]` the reverse (-1: a hole).
 */
export class RestingOrder {
  private gpuOf = new Int32Array(1024);
  private stateOf = new Int32Array(1024);
  /** Buffer slots in use, holes included: what is drawn. */
  private end = 0;
  private holes = 0;
  /** State slots below this have a buffer slot (or are in `pending`). */
  private uploaded = 0;
  /** State slots below `uploaded` swap-filled with an icon not yet sent. */
  private readonly pending = new Set<number>();
  /** Buffer slots that became holes since the last plan. */
  private readonly punched: number[] = [];
  /** The whole buffer to be sent again, in its order (after a compaction or a new context). */
  private resend = false;

  /** `capacity` is the buffer's size in icons. */
  constructor(private readonly capacity: number) {}

  /** How many buffer slots are drawn, holes included. */
  get length(): number {
    return this.end;
  }

  /** The state slot whose icon is at buffer slot `g`, or -1 for a hole. */
  slotAt(g: number): number {
    return this.stateOf[g]!;
  }

  /** The buffer slot of state slot `slot`'s icon, or -1 if it isn't there yet. */
  bufferSlotOf(slot: number): number {
    return this.gpuOf[slot]!;
  }

  /** Send the whole buffer again at the next plan (a new GPU context). */
  invalidate(): void {
    this.resend = true;
  }

  /** Take in the journal's changes to the resting set, and empty it. */
  apply(journal: ChangeJournal): void {
    if (journal.reset) this.restart();
    const { removed } = journal;
    for (let k = 0; k < removed.length; k += REMOVED_STRIDE) {
      const slot = removed[k]!;
      const last = removed[k + 1]!;
      if (slot >= this.uploaded) continue; // never sent: nothing on the GPU to change
      const g = this.pending.delete(slot) ? -1 : this.gpuOf[slot]!;
      if (g >= 0) {
        this.stateOf[g] = -1;
        this.punched.push(g);
        this.holes++;
      }
      if (slot !== last) {
        // The last icon moved down into the slot; it keeps its own place in the buffer.
        if (last < this.uploaded) {
          const lg = this.pending.delete(last) ? -1 : this.gpuOf[last]!;
          this.gpuOf[slot] = lg;
          if (lg >= 0) this.stateOf[lg] = slot;
          else this.pending.add(slot);
        } else {
          this.gpuOf[slot] = -1;
          this.pending.add(slot);
        }
      }
      this.uploaded = Math.min(this.uploaded, last);
    }
    journal.clear();
  }

  /**
   * Place the icons that settled (and any swap-filled before they were sent) at the end of the
   * buffer, given the state now has `count` resting, and say what to send.
   */
  plan(count: number): RestingUpload {
    this.grow(count);
    // Newly settled, then those swap-filled into a slot before their turn: their buffer slots.
    const fresh: number[] = [];
    for (const slot of this.pending) if (slot < count) fresh.push(slot);
    this.pending.clear();
    for (let slot = this.uploaded; slot < count; slot++) fresh.push(slot);
    this.uploaded = count;
    if (this.end + fresh.length > this.capacity || this.holes > Math.max(256, this.end / 4)) {
      this.compact();
    }
    const at = this.end;
    for (const slot of fresh) {
      if (this.end >= this.capacity) break;
      this.gpuOf[slot] = this.end;
      this.stateOf[this.end++] = slot;
    }
    if (this.resend) {
      this.resend = false;
      this.punched.length = 0;
      return { holes: [], from: 0, to: this.end };
    }
    const holes = this.punched.filter((g) => g < this.end);
    this.punched.length = 0;
    return { holes, from: at, to: this.end };
  }

  /** Buffer slots [from, to) as x, y pairs from the state's positions `xy`, holes as `HOLE`. */
  pack(xy: Float32Array, from: number, to: number): Float32Array {
    const out = new Float32Array(2 * Math.max(0, to - from));
    for (let g = from; g < to; g++) {
      const slot = this.stateOf[g]!;
      const o = 2 * (g - from);
      if (slot < 0) {
        out[o] = HOLE;
        out[o + 1] = HOLE;
      } else {
        out[o] = xy[2 * slot]!;
        out[o + 1] = xy[2 * slot + 1]!;
      }
    }
    return out;
  }

  /** Start over with an empty buffer. */
  private restart(): void {
    this.uploaded = 0;
    this.end = 0;
    this.holes = 0;
    this.pending.clear();
    this.punched.length = 0;
    this.resend = false;
  }

  /** Close up the holes, keeping every icon's order, and send the whole buffer again. */
  private compact(): void {
    let n = 0;
    for (let g = 0; g < this.end; g++) {
      const slot = this.stateOf[g]!;
      if (slot < 0) continue;
      this.stateOf[n] = slot;
      this.gpuOf[slot] = n++;
    }
    this.end = n;
    this.holes = 0;
    this.resend = true;
  }

  private grow(count: number): void {
    const need = Math.max(count, this.end) + 1;
    if (need <= this.gpuOf.length && this.capacity <= this.stateOf.length) return;
    const size = Math.max(need, this.gpuOf.length * 2);
    const gpuOf = new Int32Array(size);
    gpuOf.set(this.gpuOf);
    this.gpuOf = gpuOf;
    if (this.stateOf.length < this.capacity) {
      const stateOf = new Int32Array(this.capacity + 1);
      stateOf.set(this.stateOf);
      this.stateOf = stateOf;
    }
  }
}
