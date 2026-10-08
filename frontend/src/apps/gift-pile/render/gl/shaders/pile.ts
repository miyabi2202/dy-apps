// The icons of the pile: one instanced quad each, positioned in the vertex shader from
// world pixels and the view, so a display frame uploads nothing for a pile at rest. Moving
// icons are placed between two physics frames by `u_alpha`.

export const PILE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_xy;
layout(location = 2) in vec2 a_prevXy;
layout(location = 3) in int a_id;
uniform vec4 u_view; // top, world width, world height, time (ms)
uniform float u_sheen;
uniform vec2 u_shake;
uniform float u_radius;
uniform float u_alpha;
uniform int u_heldId;
out vec2 v_uv;
out float v_sheen;
void main() {
  vec2 p = mix(a_prevXy, a_xy, u_alpha) + u_shake;
  float top = u_view.x;
  if (a_id == u_heldId || p.y + u_radius < top || p.y - u_radius > top + u_view.z) {
    // Culled: a zero-area triangle off screen.
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    v_uv = vec2(0.0);
    v_sheen = 0.0;
    return;
  }
  vec2 w = p + a_corner * u_radius;
  gl_Position = vec4(w.x / u_view.y * 2.0 - 1.0, 1.0 - (w.y - top) / u_view.z * 2.0, 0.0, 1.0);
  v_uv = a_corner * 0.5 + 0.5;
  // A soft band of light crossing the view corner to corner every few seconds, then a rest.
  float at = (p.x / u_view.y) * 0.7 + ((p.y - top) / u_view.z) * 0.3;
  float sweep = fract(u_view.w / 7000.0) * 2.2 - 0.5;
  v_sheen = u_sheen * exp(-pow((at - sweep) / 0.07, 2.0)) * 0.16;
}
`;

export const PILE_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in float v_sheen;
uniform sampler2D u_tex;
out vec4 o;
void main() {
  vec4 t = texture(u_tex, v_uv);
  o = vec4(t.rgb + v_sheen * t.a, t.a);
}
`;
