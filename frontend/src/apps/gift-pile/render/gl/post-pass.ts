import type { PostEffects } from './post-effects';
import { createProgram, type Program } from './program';
import { BLUR_FS, BRIGHT_FS, POST_FS, POST_VS } from './shaders/post';
import type { ShapeFrame } from './shape-batch';

/** How strongly the blurred bright parts are added back. */
const BLOOM_STRENGTH = 0.8;
/** Passes of the blur: each is one direction, then the other. */
const BLUR_ROUNDS = 2;

export interface PostSettings {
  /** Samples per pixel the scene is drawn with, for the edges of what has no anti-aliasing of its own (0 for none). */
  samples: number;
  /** Add bloom: light bleeding from the bright parts. */
  bloom: boolean;
}

/** A texture to draw into. */
interface Target {
  texture: WebGLTexture | null;
  fbo: WebGLFramebuffer | null;
  width: number;
  height: number;
}

/**
 * The scene is drawn into an offscreen target, then put on the canvas by one more full-screen
 * pass, which is where effects that bend or tint the whole view go (see `POST_FS`), and the
 * bloom is added. The target is multisampled where the device can (polygons have no edge
 * anti-aliasing of their own) and resolved into a texture to be sampled.
 */
export class PostPass {
  private readonly composite: Program;
  private readonly bright: Program;
  private readonly blur: Program;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly maxSamples: number;
  /** The effects' uniforms, moved by the shake. */
  private readonly shifted = new Float32Array(16);
  private readonly hazed = new Float32Array(8);
  private samples = 0;
  private bloom = false;
  private width = 0;
  private height = 0;
  private scene: Target | null = null;
  private multisampleFbo: WebGLFramebuffer | null = null;
  private multisampleBuffer: WebGLRenderbuffer | null = null;
  /** The bloom's: the bright parts at half size, then two at quarter size to blur between. */
  private half: Target | null = null;
  private quarterA: Target | null = null;
  private quarterB: Target | null = null;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    settings: PostSettings,
  ) {
    this.composite = createProgram(gl, POST_VS, POST_FS, 'post');
    this.bright = createProgram(gl, POST_VS, BRIGHT_FS, 'bloom bright');
    this.blur = createProgram(gl, POST_VS, BLUR_FS, 'bloom blur');
    this.vao = gl.createVertexArray();
    this.maxSamples = (gl.getParameter(gl.MAX_SAMPLES) as number | null) ?? 0;
    this.samples = Math.max(0, Math.min(settings.samples, this.maxSamples));
    this.bloom = settings.bloom;
  }

  /** The programs it draws with, for the renderer to wait for. */
  get programs(): Program[] {
    return [this.composite, this.bright, this.blur];
  }

  /** Change the settings from the next frame on. */
  configure(settings: PostSettings): void {
    const samples = Math.max(0, Math.min(settings.samples, this.maxSamples));
    if (samples === this.samples && settings.bloom === this.bloom) return;
    this.samples = samples;
    this.bloom = settings.bloom;
    this.release();
  }

  /** Start drawing the scene, `width` × `height` device px: bind the target, clear it to transparent. */
  begin(width: number, height: number): void {
    const { gl } = this;
    if (width !== this.width || height !== this.height || !this.scene) {
      this.release();
      this.build(width, height);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.multisampleFbo ?? this.scene?.fbo ?? null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** The scene is drawn: make the bloom from it, and put it on the canvas with the effects asked for. */
  end(fx: PostEffects, frame: ShapeFrame): void {
    const { gl, width, height, scene } = this;
    if (!scene) return;
    if (this.multisampleFbo) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.multisampleFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scene.fbo);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    const bloomed = this.bloom && this.half && this.quarterA && this.quarterB;
    if (bloomed) this.makeBloom(scene);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    const { composite: program } = this;
    gl.useProgram(program.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.texture);
    gl.uniform1i(program.uniform('u_scene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomed ? this.quarterB!.texture : scene.texture);
    gl.uniform1i(program.uniform('u_bloom'), 1);
    gl.uniform1f(program.uniform('u_bloomStrength'), bloomed ? BLOOM_STRENGTH : 0);
    gl.uniform4f(program.uniform('u_frame'), frame.top, frame.width, frame.height, frame.time);
    // The effects are placed in the world, and the picture was drawn shaken: so they shake too.
    const { shocks, hazes, lens } = fx;
    const sx = frame.shakeX;
    const sy = frame.shakeY;
    const { shifted, hazed } = this;
    shifted.fill(0);
    hazed.fill(0);
    for (let k = 0; k < fx.shockCount; k++) {
      shifted[4 * k] = shocks[4 * k]! + sx;
      shifted[4 * k + 1] = shocks[4 * k + 1]! + sy;
      shifted[4 * k + 2] = shocks[4 * k + 2]!;
      shifted[4 * k + 3] = shocks[4 * k + 3]!;
    }
    gl.uniform1i(program.uniform('u_shocks'), fx.shockCount);
    gl.uniform4fv(program.uniform('u_shock'), shifted);
    gl.uniform1fv(program.uniform('u_shockStrength'), fx.shockStrengths);
    gl.uniform4f(program.uniform('u_lens'), lens[0]! + sx, lens[1]! + sy, lens[2]!, lens[3]!);
    for (let k = 0; k < fx.hazeCount; k++) {
      hazed[4 * k] = hazes[4 * k]! + sx;
      hazed[4 * k + 1] = hazes[4 * k + 1]! + sy;
      hazed[4 * k + 2] = hazes[4 * k + 2]!;
      hazed[4 * k + 3] = hazes[4 * k + 3]!;
    }
    gl.uniform1i(program.uniform('u_hazes'), fx.hazeCount);
    gl.uniform4fv(program.uniform('u_haze'), hazed);
    gl.uniform1fv(program.uniform('u_hazeStrength'), fx.hazeStrengths);
    gl.uniform1f(program.uniform('u_aberration'), fx.aberration);
    gl.uniform4fv(program.uniform('u_flash'), fx.flash);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }

  /** The bright parts of `scene`, blurred, in `quarterB`. */
  private makeBloom(scene: Target): void {
    const { gl, half, quarterA, quarterB } = this;
    if (!half || !quarterA || !quarterB) return;
    this.pass(this.bright, scene, half, 0, 0);
    // First blur takes the half-size bright parts down to quarter size.
    this.pass(this.blur, half, quarterA, 1, 0);
    this.pass(this.blur, quarterA, quarterB, 0, 1);
    for (let round = 1; round < BLUR_ROUNDS; round++) {
      this.pass(this.blur, quarterB, quarterA, 1, 0);
      this.pass(this.blur, quarterA, quarterB, 0, 1);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Draw `from` into `to` through `program`, stepping `stepX`, `stepY` texels (blur only). */
  private pass(program: Program, from: Target, to: Target, stepX: number, stepY: number): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.viewport(0, 0, to.width, to.height);
    gl.useProgram(program.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.texture);
    gl.uniform1i(program.uniform('u_src'), 0);
    gl.uniform2f(program.uniform('u_step'), stepX / from.width, stepY / from.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private target(width: number, height: number): Target {
    const { gl } = this;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, fbo, width, height };
  }

  private build(width: number, height: number): void {
    const { gl } = this;
    this.width = width;
    this.height = height;
    this.scene = this.target(width, height);
    if (this.samples > 0) {
      this.multisampleBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.multisampleBuffer);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.RGBA8, width, height);
      this.multisampleFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.multisampleFbo);
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.RENDERBUFFER,
        this.multisampleBuffer,
      );
    }
    if (this.bloom) {
      const hw = Math.max(1, width >> 1);
      const hh = Math.max(1, height >> 1);
      const qw = Math.max(1, width >> 2);
      const qh = Math.max(1, height >> 2);
      this.half = this.target(hw, hh);
      this.quarterA = this.target(qw, qh);
      this.quarterB = this.target(qw, qh);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private release(): void {
    const { gl } = this;
    for (const target of [this.scene, this.half, this.quarterA, this.quarterB]) {
      if (!target) continue;
      gl.deleteFramebuffer(target.fbo);
      gl.deleteTexture(target.texture);
    }
    gl.deleteFramebuffer(this.multisampleFbo);
    gl.deleteRenderbuffer(this.multisampleBuffer);
    this.scene = null;
    this.half = null;
    this.quarterA = null;
    this.quarterB = null;
    this.multisampleFbo = null;
    this.multisampleBuffer = null;
  }
}
