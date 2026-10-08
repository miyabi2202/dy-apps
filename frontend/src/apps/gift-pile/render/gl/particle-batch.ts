import type { Blend, ParticleData } from '../gfx';
import { createProgram, type Program } from './program';
import { PARTICLES_FS, PARTICLES_VS } from './shaders/particles';
import type { ShapeFrame } from './shape-batch';

/** Floats per particle: x, y, size, rotation, then red, green, blue, alpha. */
const FLOATS = 8;

/**
 * Draws particles: one instanced draw of a quad each, for each `ParticleData` it is given,
 * from a buffer filled with that call's arrays. Whatever is waiting in the shapes batch must
 * be drawn first (by the caller) to keep the order of layers.
 */
export class ParticleBatch {
  private readonly program: Program;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly cornerBuffer: WebGLBuffer | null;
  private readonly instanceBuffer: WebGLBuffer | null;
  private data = new Float32Array(FLOATS * 1024);
  private frame: ShapeFrame = { top: 0, width: 1, height: 1, time: 0, px: 1, shakeX: 0, shakeY: 0 };

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, PARTICLES_VS, PARTICLES_FS, 'particles');
    this.vao = gl.createVertexArray();
    this.cornerBuffer = gl.createBuffer();
    this.instanceBuffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const stride = FLOATS * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
  }

  /** Start a frame. */
  begin(frame: ShapeFrame): void {
    this.frame = frame;
  }

  /** Draw `particles` with `texture` (a soft shape, white on transparent). */
  draw(particles: ParticleData, texture: WebGLTexture, blend: Blend): void {
    const { gl, program, frame } = this;
    const count = particles.count;
    if (count <= 0) return;
    if (count * FLOATS > this.data.length) this.data = new Float32Array(count * FLOATS * 2);
    const { data } = this;
    const { xy, size, rgba, rotation } = particles;
    for (let k = 0; k < count; k++) {
      const at = k * FLOATS;
      data[at] = xy[2 * k]!;
      data[at + 1] = xy[2 * k + 1]!;
      data[at + 2] = size[k]!;
      data[at + 3] = rotation?.[k] ?? 0;
      data[at + 4] = rgba[4 * k]!;
      data[at + 5] = rgba[4 * k + 1]!;
      data[at + 6] = rgba[4 * k + 2]!;
      data[at + 7] = rgba[4 * k + 3]!;
    }
    gl.useProgram(program.program);
    gl.uniform4f(program.uniform('u_view'), frame.top, frame.width, frame.height, 0);
    gl.uniform2f(program.uniform('u_shake'), frame.shakeX, frame.shakeY);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(program.uniform('u_tex'), 0);
    gl.enable(gl.BLEND);
    if (blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * FLOATS), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }
}
