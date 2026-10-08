/** A linked program and a cache of its uniforms' locations. */
export interface Program {
  /** For logs. */
  readonly name: string;
  /** The linked program; the first use finishes the compile (waiting for it) and throws if it failed. */
  readonly program: WebGLProgram;
  /** The uniform's location, or null if the program has no such (live) uniform. */
  uniform(name: string): WebGLUniformLocation | null;
  /** Start compiling and linking, if that has not begun; never waits. */
  start(): void;
  /**
   * The compile is over, so `resolve` will not wait: always false before `start`, and without
   * `KHR_parallel_shader_compile` (the driver can't say) false until `resolve` has run.
   */
  ready(): boolean;
  /** Finish: wait for the compile if need be, check it, and throw with the log if it failed. */
  resolve(): void;
}

/** What `KHR_parallel_shader_compile` adds. */
interface ParallelCompile {
  COMPLETION_STATUS_KHR: number;
}

const extensions = new WeakMap<WebGL2RenderingContext, ParallelCompile | null>();

/** The extension that lets compiles run on other threads and be polled, if the browser has it. */
export function parallelCompile(gl: WebGL2RenderingContext): ParallelCompile | null {
  let ext = extensions.get(gl);
  if (ext === undefined) {
    ext = gl.getExtension('KHR_parallel_shader_compile');
    extensions.set(gl, ext);
  }
  return ext;
}

class LazyProgram implements Program {
  private program_: WebGLProgram | null = null;
  private shaders: WebGLShader[] = [];
  private linked = false;
  private failure: Error | null = null;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly vertex: string,
    private readonly fragment: string,
    readonly name: string,
  ) {}

  get program(): WebGLProgram {
    this.resolve();
    return this.program_!;
  }

  uniform(uniformName: string): WebGLUniformLocation | null {
    let at = this.locations.get(uniformName);
    if (at === undefined) {
      at = this.gl.getUniformLocation(this.program, uniformName);
      this.locations.set(uniformName, at);
    }
    return at;
  }

  start(): void {
    if (this.program_ || this.failure) return;
    const { gl, name } = this;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      this.failure = new Error(`${name}: could not create a shader or program`);
      return;
    }
    gl.shaderSource(vs, this.vertex);
    gl.shaderSource(fs, this.fragment);
    gl.compileShader(vs);
    gl.compileShader(fs);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    this.shaders = [vs, fs];
    this.program_ = program;
  }

  ready(): boolean {
    if (this.linked || this.failure) return true;
    if (!this.program_) return false;
    const ext = parallelCompile(this.gl);
    return ext ? !!this.gl.getProgramParameter(this.program_, ext.COMPLETION_STATUS_KHR) : false;
  }

  resolve(): void {
    if (this.linked) return;
    if (!this.failure) {
      this.start();
      if (!this.failure) this.check();
    }
    if (this.failure) throw this.failure;
  }

  /** Read the compile and link results (waits for them if they are not in yet). */
  private check(): void {
    const { gl, name } = this;
    const program = this.program_!;
    const [vs, fs] = this.shaders as [WebGLShader, WebGLShader];
    let problem: string | null = null;
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      problem = `${name} vertex: shader failed to compile: ${gl.getShaderInfoLog(vs) ?? ''}`;
    } else if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      problem = `${name} fragment: shader failed to compile: ${gl.getShaderInfoLog(fs) ?? ''}`;
    } else if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      problem = `${name}: program failed to link: ${gl.getProgramInfoLog(program) ?? ''}`;
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.shaders = [];
    if (problem) {
      gl.deleteProgram(program);
      this.program_ = null;
      this.failure = new Error(problem);
    } else {
      this.linked = true;
    }
  }
}

/**
 * Make a program from GLSL; the `#version 300 es` line must be the first characters of each
 * source. Where the browser can compile in parallel it starts at once and is only waited for
 * when something first needs it (`resolve`, `.program`, `uniform`); otherwise it starts at the
 * first of those, so a caller that wants no stall resolves one a frame (see `WarmUp`). A
 * failure throws from `resolve` with the shader's log and `name`.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  name: string,
): Program {
  const program = new LazyProgram(gl, vertex, fragment, name);
  if (parallelCompile(gl)) program.start();
  return program;
}
