import type { PileSettings } from '../../core/config';
import type { Frame } from '../../core/protocol';
import { type ChangeJournal, type PileState, REMOVED_STRIDE } from '../pile-state';
import { createProgram, type Program } from './program';
import { PILE_FS, PILE_VS } from './shaders/pile';

type Stage = Pick<PileSettings, 'radius' | 'maxItems'>;

/** Past this many single slots to patch, the patches are sent as one run instead. */
const MAX_PATCHES = 256;
/** Bytes in an x, y pair, and in an id. */
const XY_BYTES = 8;

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

  /** How many resting slots the buffer has in step with the state's. */
  private uploaded = 0;
  /** Slots below `uploaded` that changed, and are to be sent again. */
  private readonly dirty = new Set<number>();
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
    if (journal.reset) {
      this.uploaded = 0;
      this.dirty.clear();
    }
    const { removed } = journal;
    for (let k = 0; k < removed.length; k += REMOVED_STRIDE) {
      const slot = removed[k]!;
      const last = removed[k + 1]!;
      // The last icon moved down into the slot the removed one left.
      if (slot !== last && slot < this.uploaded) this.dirty.add(slot);
      this.uploaded = Math.min(this.uploaded, last);
    }
    journal.clear();
  }

  /** Make the GPU objects in `gl`, and send everything again on the next draw. */
  attach(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.program = createProgram(gl, PILE_VS, PILE_FS, 'pile');
    this.uploaded = 0;
    this.dirty.clear();
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

    const resting = Math.min(state.restingCount, this.capacity);
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

  /** Send the resting buffer what changed since the last draw. */
  private uploadResting(gl: WebGL2RenderingContext, state: PileState): void {
    const xy = state.restingXy;
    const count = Math.min(state.restingCount, this.capacity);
    if (this.dirty.size > MAX_PATCHES) {
      // So many patches that one run from the first is cheaper.
      let first = this.uploaded;
      for (const slot of this.dirty) first = Math.min(first, slot);
      this.uploaded = first;
      this.dirty.clear();
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.restingBuffer);
    for (const slot of this.dirty) {
      if (slot < count && slot < this.uploaded) {
        gl.bufferSubData(gl.ARRAY_BUFFER, slot * XY_BYTES, xy, 2 * slot, 2);
      }
    }
    this.dirty.clear();
    if (this.uploaded > count) this.uploaded = count;
    if (this.uploaded < count) {
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        this.uploaded * XY_BYTES,
        xy,
        2 * this.uploaded,
        2 * (count - this.uploaded),
      );
      this.uploaded = count;
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
