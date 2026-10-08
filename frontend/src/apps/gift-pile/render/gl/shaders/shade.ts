// The program every `ShaderSource` is wrapped in. Its vertex shader is the shapes one with the
// same vertex layout (so it shares the shapes batch), except that the `kind` slot carries `px`:
// how many caller units a device pixel is, so a shader can anti-alias in its own units whatever
// the transform. `a_local` is in caller units from the box's centre.

import { PRELUDE_GLSL } from './prelude';

export const SHADE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
layout(location = 3) in float a_px;
layout(location = 4) in vec4 a_p;
layout(location = 5) in vec4 a_q;
layout(location = 6) in vec2 a_local;
uniform vec4 u_view; // top, world width, world height, unused
uniform vec2 u_shake;
out vec4 v_color;
out vec2 v_local;
flat out float v_px;
flat out vec4 v_p;
flat out vec4 v_q;
void main() {
  vec2 p = a_pos + u_shake;
  gl_Position = vec4(p.x / u_view.y * 2.0 - 1.0, 1.0 - (p.y - u_view.x) / u_view.z * 2.0, 0.0, 1.0);
  v_color = a_color;
  v_local = a_local;
  v_px = a_px;
  v_p = a_p;
  v_q = a_q;
}
`;

/** The fragment shader of a source: its declarations, the prelude, the source's `shade`, and `main`. */
export function shadeFragment(glsl: string): string {
  return `#version 300 es
precision highp float;
in vec4 v_color;
in vec2 v_local;
flat in float v_px;
flat in vec4 v_p;
flat in vec4 v_q;
uniform float u_time; // ms
out vec4 o;
${PRELUDE_GLSL}
${glsl}
void main() {
  o = shade(v_local, v_p, v_q, v_color.rgb) * v_color.a;
}
`;
}
