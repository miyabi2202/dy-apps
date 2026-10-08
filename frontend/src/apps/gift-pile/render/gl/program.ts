/** A linked program and a cache of its uniforms' locations. */
export interface Program {
  readonly program: WebGLProgram;
  /** The uniform's location, or null if the program has no such (live) uniform. */
  uniform(name: string): WebGLUniformLocation | null;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string, name: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`${name}: could not create a shader`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`${name}: shader failed to compile: ${log ?? ''}`);
  }
  return shader;
}

/**
 * Compile and link a program. The `#version 300 es` line must be the first characters of
 * each source. A failure throws with the shader's log and `name`.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  name: string,
): Program {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex, `${name} vertex`);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment, `${name} fragment`);
  const program = gl.createProgram();
  if (!program) throw new Error(`${name}: could not create a program`);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`${name}: program failed to link: ${log ?? ''}`);
  }
  const locations = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    uniform(uniformName) {
      let at = locations.get(uniformName);
      if (at === undefined) {
        at = gl.getUniformLocation(program, uniformName);
        locations.set(uniformName, at);
      }
      return at;
    },
  };
}
