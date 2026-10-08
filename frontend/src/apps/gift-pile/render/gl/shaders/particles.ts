// Particles: one instanced quad each, from a buffer of position, size, turn and colour. The
// texture is one of the built-in soft shapes, white on transparent, tinted by the colour.

export const PARTICLES_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_xysr; // x, y, size (diameter), rotation
layout(location = 2) in vec4 a_color; // straight alpha
uniform vec4 u_view; // top, world width, world height, unused
uniform vec2 u_shake;
out vec2 v_uv;
out vec4 v_color;
void main() {
  float c = cos(a_xysr.w);
  float s = sin(a_xysr.w);
  vec2 q = a_corner * 0.5 * a_xysr.z;
  vec2 p = a_xysr.xy + vec2(q.x * c - q.y * s, q.x * s + q.y * c) + u_shake;
  gl_Position = vec4(p.x / u_view.y * 2.0 - 1.0, 1.0 - (p.y - u_view.x) / u_view.z * 2.0, 0.0, 1.0);
  v_uv = a_corner * 0.5 + 0.5;
  v_color = a_color;
}
`;

export const PARTICLES_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_tex;
out vec4 o;
void main() {
  o = texture(u_tex, v_uv) * vec4(v_color.rgb, 1.0) * v_color.a;
}
`;
