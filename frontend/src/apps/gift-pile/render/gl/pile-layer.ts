import type { PileSettings } from '../../core/config';
import type { Frame } from '../../core/protocol';
import { type ChangeJournal, type PileState, REMOVED_STRIDE } from '../pile-state';
import { createProgram, type Program } from './program';
import { PILE_FS, PILE_VS } from './shaders/pile';

type Stage = Pick<PileSettings, 'radius' | 'maxItems'>;

/** Bytes in an x, y pair, and in an id. */
const XY_BYTES = 8;
/** Where a hole in the resting buffer is: far above any view, so the shader culls it. */
const HOLE = -1e30;

/** What a draw of the layer needs to know. */
export interface PileDraw {
  /** The view's top, the world's width and height (world px). */
  view: { top: number; width: number; height: number };
  /** The screen shake, world px. */
  shake: { x: number; y: number };
  now: number;
  /** The icon the user holds, which is drawn elsewhere; -1 for none. */
  heldId: number;
  texture: WebGLTexture;
  /** A faint light sweeps across the resting icons now and then. */
  sheen: boolean;
}

/**
 * The pile's icons on the GPU, drawn as two instanced draws of one quad each: those at rest,
 * every frame, from a buffer that mirrors the state's resting set, and those moving, between
 * where the last two physics frames put them.
 *
 * The resting buffer is kept in step by the state's journal, not by looking at the whole set:
 * `uploaded` slots are in sync, newly settled icons are past it and sent as one run, and a
 * removal that swap-filled a slot marks it to be sent again. Nothing is uploaded for a pile
 * that isn't changing, and a moving icon costs a few bytes once per physics frame, not per
 * display frame. The bookkeeping lives apart from the GPU objects, so it survives the
 * context being lost: `attach` makes them again and the whole set is sent anew.
 */
export class PileLayer {
  private gl: WebGL2RenderingContext | null = null;
  private program: Program | null = null;
  private restingVao: WebGLVertexArrayObject | null = null;
  private movingVao: WebGLVertexArrayObject | null = null;
  private restingBuffer: WebGLBuffer | null = null;
  private movingXyBuffer: WebGLBuffer | null = null;
  private movingPrevBuffer: WebGLBuffer | null = null;
  private movingIdBuffer: WebGLBuffer | null = null;
  private cornerBuffer: WebGLBuffer | null = null;

  /**
   * The GPU buffer keeps icons in the order they settled and never reorders them: overlapping
   * icons are drawn in buffer order, so swap-filling a slot (as the state does) would send an
   * icon behind its neighbours. A removal leaves a hole (`HOLE`, culled by the shader) and the
   * buffer is compacted, keeping its order, once holes are many.
   * `gpuOf[stateSlot]` is where a state slot's icon is in the buffer (-1: not sent yet), and
   * `stateOf[gpuSlot]` the reverse (-1: a hole).
   */
  private gpuOf = new Int32Array(1024);
  private stateOf = new Int32Array(1024);
  /** Buffer slots in use, holes included: what is drawn. */
  private gpuEnd = 0;
  private holes = 0;
  /** State slots below this have a buffer slot (or are in `pending`). */
  private uploaded = 0;
  /** State slots below `uploaded` swap-filled with an icon not yet sent. */
  private readonly pending = new Set<number>();
  /** Buffer slots that became holes since the last draw. */
  private readonly punched: number[] = [];
  /** The whole buffer to be sent again, in its order (after a compaction or a new context). */
  private resend = false;
  /** The physics frame the moving buffers hold. */
  private uploadedFrame: Frame | null = null;
  private movingCount = 0;
  /** Room for this many icons, resting and moving each. */
  private readonly capacity: number;
  /** Where each moving icon was a physics frame ago, built to send. */
  private readonly prevScratch: Float32Array;

  constructor(private readonly stage: Stage) {
    this.capacity = stage.maxItems;
    this.prevScratch = new Float32Array(2 * this.capacity);
  }

  /**
   * Take in what happened to the resting set since the last call, from the state's journal,
   * and empty it. The buffer itself is brought up to date by the next draw.
   */
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

  /** Make the GPU objects in `gl`, and send everything again on the next draw. */
  attach(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.program = createProgram(gl, PILE_VS, PILE_FS, 'pile');
    this.resend = true;
    this.uploadedFrame = null;
    this.movingCount = 0;

    this.cornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const buffer = (bytes: number) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
      return b;
    };
    this.restingBuffer = buffer(this.capacity * XY_BYTES);
    this.movingXyBuffer = buffer(this.capacity * XY_BYTES);
    this.movingPrevBuffer = buffer(this.capacity * XY_BYTES);
    this.movingIdBuffer = buffer(this.capacity * 4);

    const corner = () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    };
    const instanced = (index: number, source: WebGLBuffer | null) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, source);
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(index, 1);
    };

    // Resting: its position is its own previous, and it has no id to be held by.
    this.restingVao = gl.createVertexArray();
    gl.bindVertexArray(this.restingVao);
    corner();
    instanced(1, this.restingBuffer);
    instanced(2, this.restingBuffer);
    gl.disableVertexAttribArray(3);

    this.movingVao = gl.createVertexArray();
    gl.bindVertexArray(this.movingVao);
    corner();
    instanced(1, this.movingXyBuffer);
    instanced(2, this.movingPrevBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.movingIdBuffer);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 1, gl.INT, 0, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }

  /** The programs it draws with (once attached), for the renderer to wait for. */
  get programs(): Program[] {
    return this.program ? [this.program] : [];
  }

  /** Let the GPU objects go with the context. */
  detach(): void {
    this.gl = null;
    this.program = null;
  }

  /** Draw the pile in `state`: the resting icons, then the moving. */
  draw(state: PileState, { view, shake, now, heldId, texture, sheen }: PileDraw): void {
    const { gl, program } = this;
    if (!gl || !program) return;
    this.uploadResting(gl, state);
    this.uploadMoving(gl, state);

    gl.useProgram(program.program);
    gl.uniform4f(program.uniform('u_view'), view.top, view.width, view.height, now);
    gl.uniform1f(program.uniform('u_sheen'), sheen ? 1 : 0);
    gl.uniform2f(program.uniform('u_shake'), shake.x, shake.y);
    gl.uniform1f(program.uniform('u_radius'), this.stage.radius);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(program.uniform('u_tex'), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const resting = this.gpuEnd;
    if (resting > 0) {
      gl.uniform1f(program.uniform('u_alpha'), 1);
      gl.uniform1i(program.uniform('u_heldId'), -1);
      gl.bindVertexArray(this.restingVao);
      // A constant id: nothing resting is held. (A generic attribute's value is context state, not the VAO's.)
      gl.vertexAttribI4i(3, -2, 0, 0, 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, resting);
    }
    if (this.movingCount > 0) {
      const { cur, prev, curArrived } = state;
      const span = cur && prev ? Math.max(1, cur.time - prev.time) : 1;
      const alpha = prev ? Math.min(1, Math.max(0, (now - curArrived) / span)) : 1;
      gl.uniform1f(program.uniform('u_alpha'), alpha);
      gl.uniform1i(program.uniform('u_heldId'), heldId);
      gl.bindVertexArray(this.movingVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.movingCount);
    }
    gl.bindVertexArray(null);
  }

  /** Start over with an empty buffer. */
  private restart(): void {
    this.uploaded = 0;
    this.gpuEnd = 0;
    this.holes = 0;
    this.pending.clear();
    this.punched.length = 0;
    this.resend = false;
  }

  /**
   * Send the resting buffer what changed since the last draw: holes where icons left, and the
   * newly settled (and any swap-filled before they were sent) at the end, so every icon keeps
   * its place among the rest.
   */
  private uploadResting(gl: WebGL2RenderingContext, state: PileState): void {
    const xy = state.restingXy;
    const count = state.restingCount;
    this.grow(count);
    // Newly settled, then those swap-filled into a slot before their turn: their buffer slots.
    const fresh: number[] = [];
    for (const slot of this.pending) if (slot < count) fresh.push(slot);
    this.pending.clear();
    for (let slot = this.uploaded; slot < count; slot++) fresh.push(slot);
    this.uploaded = count;
    if (this.gpuEnd + fresh.length > this.capacity || this.holes > Math.max(256, this.gpuEnd / 4)) {
      this.compact();
    }
    const at = this.gpuEnd;
    for (const slot of fresh) {
      if (this.gpuEnd >= this.capacity) break;
      this.gpuOf[slot] = this.gpuEnd;
      this.stateOf[this.gpuEnd++] = slot;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.restingBuffer);
    if (this.resend) {
      this.resend = false;
      this.punched.length = 0;
      this.sendRange(gl, xy, 0, this.gpuEnd);
      return;
    }
    const hole = new Float32Array([HOLE, HOLE]);
    for (const g of this.punched)
      if (g < this.gpuEnd) gl.bufferSubData(gl.ARRAY_BUFFER, g * XY_BYTES, hole);
    this.punched.length = 0;
    this.sendRange(gl, xy, at, this.gpuEnd);
  }

  /** Send buffer slots [from, to) from the state's positions. */
  private sendRange(gl: WebGL2RenderingContext, xy: Float32Array, from: number, to: number): void {
    if (to <= from) return;
    const out = new Float32Array(2 * (to - from));
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
    gl.bufferSubData(gl.ARRAY_BUFFER, from * XY_BYTES, out);
  }

  /** Close up the holes, keeping every icon's order, and send the whole buffer again. */
  private compact(): void {
    let n = 0;
    for (let g = 0; g < this.gpuEnd; g++) {
      const slot = this.stateOf[g]!;
      if (slot < 0) continue;
      this.stateOf[n] = slot;
      this.gpuOf[slot] = n++;
    }
    this.gpuEnd = n;
    this.holes = 0;
    this.resend = true;
  }

  private grow(count: number): void {
    const need = Math.max(count, this.gpuEnd) + 1;
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

  /** Send the moving buffers the latest physics frame, once, with each icon's place in the one before. */
  private uploadMoving(gl: WebGL2RenderingContext, state: PileState): void {
    const { cur, prev, prevAt } = state;
    if (cur === this.uploadedFrame) return;
    this.uploadedFrame = cur;
    if (!cur) {
      this.movingCount = 0;
      return;
    }
    const n = Math.min(cur.movingIds.length, this.capacity);
    const previous = this.prevScratch;
    for (let k = 0; k < n; k++) {
      const j = prev ? prevAt.get(cur.movingIds[k]!) : undefined;
      if (prev && j !== undefined) {
        previous[2 * k] = prev.movingXy[2 * j]!;
        previous[2 * k + 1] = prev.movingXy[2 * j + 1]!;
      } else {
        previous[2 * k] = cur.movingXy[2 * k]!;
        previous[2 * k + 1] = cur.movingXy[2 * k + 1]!;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.movingXyBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, cur.movingXy, 0, 2 * n);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.movingPrevBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, previous, 0, 2 * n);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.movingIdBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, cur.movingIds, 0, n);
    this.movingCount = n;
  }
}
