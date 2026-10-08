import type { Rgba } from '../color';
import type { Blend } from '../gfx';
import { createProgram, type Program } from './program';
import { SHAPES_FS, SHAPES_VS } from './shaders/shapes';

/** What a shape is, for `a_kind` in the shapes shader. */
export const KIND = {
  sprite: 0,
  circle: 1,
  rect: 3,
  wedge: 4,
  capsule: 5,
  ellipse: 6,
  glow: 8,
  solid: 12,
  flat: 14,
} as const;

/** What the shader needs to know about the frame. */
export interface ShapeFrame {
  top: number;
  width: number;
  height: number;
  /** ms, for what animates in the shader. */
  time: number;
  /** World px per device px, for the width of an edge's anti-aliasing. */
  px: number;
  shakeX: number;
  shakeY: number;
}

/** Floats per vertex: position 2, uv 2, colour 4, kind 1, p 4, q 4, local 2. */
const FLOATS = 19;

/**
 * Builds triangles on the CPU, in the order they are asked for, and draws them with the
 * shapes program: one draw call for as long as the texture and blend stay the same, which
 * for a removal is a handful a frame. A shape is set up with `shape`, then given its
 * vertices (`vertex`) and triangles (`triangle`, `quad`).
 */
export class ShapeBatch {
  private readonly program: Program;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly vertexBuffer: WebGLBuffer | null;
  private readonly indexBuffer: WebGLBuffer | null;
  private data = new Float32Array(FLOATS * 2048);
  private indices = new Uint32Array(3 * 2048);
  private vertices = 0;
  private indexCount = 0;
  private texture: WebGLTexture | null = null;
  private blend: Blend = 'normal';
  /** A `ShaderSource`'s program in use instead of the core one. */
  private custom: Program | null = null;
  private frame: ShapeFrame = { top: 0, width: 1, height: 1, time: 0, px: 1, shakeX: 0, shakeY: 0 };

  // The shape being built.
  private kind: number = KIND.flat;
  private readonly p = [0, 0, 0, 0];
  private readonly q = [0, 0, 0, 0];

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly white: WebGLTexture,
  ) {
    this.program = createProgram(gl, SHAPES_VS, SHAPES_FS, 'shapes');
    this.vao = gl.createVertexArray();
    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    const stride = FLOATS * 4;
    const attribute = (index: number, size: number, offset: number) => {
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, stride, offset * 4);
    };
    attribute(0, 2, 0);
    attribute(1, 2, 2);
    attribute(2, 4, 4);
    attribute(3, 1, 8);
    attribute(4, 4, 9);
    attribute(5, 4, 13);
    attribute(6, 2, 17);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);
  }

  /** How many vertices are waiting, which is the index the next one gets. */
  get vertexCount(): number {
    return this.vertices;
  }

  /** Start a frame. */
  begin(frame: ShapeFrame): void {
    this.frame = frame;
    this.vertices = 0;
    this.indexCount = 0;
    this.texture = null;
    this.blend = 'normal';
    this.custom = null;
  }

  /**
   * Draw what is asked next with `texture` (white if null), `blend`, and `program` (the core
   * shapes program if null: a `ShaderSource`'s otherwise). A change of any flushes.
   */
  use(texture: WebGLTexture | null, blend: Blend, program: Program | null = null): void {
    const wanted = texture ?? this.white;
    if (wanted === this.texture && blend === this.blend && program === this.custom) return;
    this.flush();
    this.texture = wanted;
    this.blend = blend;
    this.custom = program;
  }

  /** The programs `warm` draws with: the core one, and these. */
  get corePrograms(): Program[] {
    return [this.program];
  }

  /**
   * Draw one invisible speck with each of `programs` (and the core one, unless `core` is
   * false) in both blends, so the driver builds their pipelines now rather than at the first
   * real draw. Draws nothing visible (zero alpha), into whatever target is bound.
   */
  warm(programs: readonly Program[], core = true): void {
    const clear: Rgba = [0, 0, 0, 0];
    this.flush();
    for (const program of core ? [null, ...programs] : programs) {
      for (const blend of ['normal', 'add'] as const) {
        this.use(null, blend, program);
        this.shape(KIND.flat);
        const first = this.vertices;
        for (const [x, y] of [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ] as const) {
          this.vertex(x, y, 0, 0, clear, 1, x, y);
        }
        this.quad(first);
        this.flush();
      }
    }
    this.texture = null;
    this.custom = null;
  }

  /** Set up the shape the next vertices belong to. */
  shape(kind: number, p0 = 0, p1 = 0, p2 = 0, p3 = 0, q0 = 0, q1 = 0, q2 = 0, q3 = 0): void {
    this.kind = kind;
    const { p, q } = this;
    p[0] = p0;
    p[1] = p1;
    p[2] = p2;
    p[3] = p3;
    q[0] = q0;
    q[1] = q1;
    q[2] = q2;
    q[3] = q3;
  }

  /** Add a vertex of the current shape at world (x, y), `alpha` times the colour's own; returns its index. */
  vertex(
    x: number,
    y: number,
    u: number,
    v: number,
    [r, g, b, a]: Rgba,
    alpha: number,
    localX: number,
    localY: number,
  ): number {
    if ((this.vertices + 1) * FLOATS > this.data.length) {
      const bigger = new Float32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    const { data, p, q } = this;
    let at = this.vertices * FLOATS;
    data[at++] = x;
    data[at++] = y;
    data[at++] = u;
    data[at++] = v;
    data[at++] = r;
    data[at++] = g;
    data[at++] = b;
    data[at++] = a * alpha;
    data[at++] = this.kind;
    data[at++] = p[0]!;
    data[at++] = p[1]!;
    data[at++] = p[2]!;
    data[at++] = p[3]!;
    data[at++] = q[0]!;
    data[at++] = q[1]!;
    data[at++] = q[2]!;
    data[at++] = q[3]!;
    data[at++] = localX;
    data[at] = localY;
    return this.vertices++;
  }

  triangle(a: number, b: number, c: number): void {
    if (this.indexCount + 3 > this.indices.length) {
      const bigger = new Uint32Array(this.indices.length * 2);
      bigger.set(this.indices);
      this.indices = bigger;
    }
    this.indices[this.indexCount++] = a;
    this.indices[this.indexCount++] = b;
    this.indices[this.indexCount++] = c;
  }

  /** Two triangles over four vertices added in order round a quad, from `first`. */
  quad(first: number): void {
    this.triangle(first, first + 1, first + 2);
    this.triangle(first, first + 2, first + 3);
  }

  /** Draw what has been built since the last flush. */
  flush(): void {
    const { gl, frame } = this;
    const program = this.custom ?? this.program;
    if (this.indexCount === 0 || !this.texture) {
      this.vertices = 0;
      this.indexCount = 0;
      return;
    }
    gl.useProgram(program.program);
    gl.uniform4f(program.uniform('u_view'), frame.top, frame.width, frame.height, 0);
    gl.uniform2f(program.uniform('u_shake'), frame.shakeX, frame.shakeY);
    gl.uniform1f(program.uniform('u_time'), frame.time);
    gl.uniform1f(program.uniform('u_px'), frame.px);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(program.uniform('u_tex'), 0);
    gl.enable(gl.BLEND);
    if (this.blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.vertices * FLOATS), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this.indices.subarray(0, this.indexCount),
      gl.DYNAMIC_DRAW,
    );
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    this.vertices = 0;
    this.indexCount = 0;
  }
}
