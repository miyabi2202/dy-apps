// Everything the removals draw but the pile's icons: textured sprites and anti-aliased
// primitives, one program. Each vertex says what its shape is (`a_kind`), the shape's
// numbers (`a_p`, `a_q`), and where it is in the shape, in px from its centre (`a_local`),
// so the fragment shader can work out the signed distance to the edge and cover the edge by it.

/** The vertex shader: world px to clip space, passing the shape's numbers on. */
export const SHAPES_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
layout(location = 3) in float a_kind;
layout(location = 4) in vec4 a_p;
layout(location = 5) in vec4 a_q;
layout(location = 6) in vec2 a_local;
uniform vec4 u_view; // top, world width, world height, unused
uniform vec2 u_shake;
out vec2 v_uv;
out vec4 v_color;
out vec2 v_local;
flat out float v_kind;
flat out vec4 v_p;
flat out vec4 v_q;
void main() {
  vec2 p = a_pos + u_shake;
  gl_Position = vec4(p.x / u_view.y * 2.0 - 1.0, 1.0 - (p.y - u_view.x) / u_view.z * 2.0, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
  v_local = a_local;
  v_kind = a_kind;
  v_p = a_p;
  v_q = a_q;
}
`;

/** The fragment shader: what `a_kind` says, the same numbers as `KIND` in `shape-batch.ts`. */
export const SHAPES_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
in vec2 v_local;
flat in float v_kind;
flat in vec4 v_p;
flat in vec4 v_q;
uniform sampler2D u_tex;
uniform float u_px;   // world px per device px
out vec4 o;

const float TAU = 6.2831853;

// Coverage of an edge at signed distance d (px, negative inside), feathered over at least a device px.
float cover(float d, float feather) {
  float f = max(u_px * 0.75, feather);
  return 1.0 - smoothstep(-f, f, d);
}

// An outline of width v_q.x centred on the edge, when there is one.
float outline(float d) {
  return v_q.x > 0.0 ? abs(d) - v_q.x * 0.5 : d;
}

void main() {
  int k = int(v_kind + 0.5);
  vec4 c = v_color; // straight alpha
  float a = 1.0;

  if (k == 0) { // textured sprite, tinted
    o = texture(u_tex, v_uv) * vec4(c.rgb, 1.0) * c.a;
    return;
  } else if (k == 1) { // circle, ring: p.x radius, p.w feather
    a = cover(outline(length(v_local) - v_p.x), v_p.w);
  } else if (k == 3) { // rounded rect: p.xy half size, p.z corner radius, p.w feather
    vec2 q = abs(v_local) - v_p.xy + v_p.z;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - v_p.z;
    a = cover(outline(d), v_p.w);
  } else if (k == 4) { // pie slice: p.x radius, p.y from, p.z span, p.w feather
    vec2 p = v_local;
    float ring = cover(length(p) - v_p.x, v_p.w);
    float span = v_p.z;
    float sector = 1.0;
    if (span < TAU - 0.001) {
      float ang = mod(atan(p.y, p.x) - v_p.y, TAU);
      vec2 e0 = vec2(cos(v_p.y), sin(v_p.y));
      vec2 e1 = vec2(cos(v_p.y + span), sin(v_p.y + span));
      float d0 = dot(p, e0) > 0.0 ? abs(p.x * e0.y - p.y * e0.x) : length(p);
      float d1 = dot(p, e1) > 0.0 ? abs(p.x * e1.y - p.y * e1.x) : length(p);
      float f = max(u_px * 0.75, v_p.w);
      float edge = smoothstep(-f, f, min(d0, d1));
      sector = ang <= span ? edge : 1.0 - edge;
    }
    a = ring * sector;
  } else if (k == 5) { // capsule along x: p.x half length of its spine, p.y radius, p.w feather
    vec2 q = v_local - vec2(clamp(v_local.x, -v_p.x, v_p.x), 0.0);
    a = cover(length(q) - v_p.y, v_p.w);
  } else if (k == 6) { // ellipse: p.xy radii, p.w feather; q.yzw dash on, off, offset
    vec2 r = v_p.xy;
    float k0 = length(v_local / r);
    float k1 = length(v_local / (r * r));
    float d = k1 > 1e-6 ? k0 * (k0 - 1.0) / k1 : -min(r.x, r.y);
    a = cover(outline(d), v_p.w);
    if (v_q.x > 0.0 && v_q.y > 0.0) {
      float s = atan(v_local.y / r.y, v_local.x / r.x) * (r.x + r.y) * 0.5;
      if (mod(s + v_q.w, v_q.y + v_q.z) >= v_q.y) a = 0.0;
    }
  } else if (k == 8) { // glow: p.x falloff exponent, p.y share kept at full, p.z radius
    float r = length(v_local) / v_p.z;
    a = pow(clamp((1.0 - r) / max(1.0 - v_p.y, 0.001), 0.0, 1.0), v_p.x);
  } else if (k == 12) { // solid: the sprite's shape in one colour
    o = vec4(c.rgb, 1.0) * (texture(u_tex, v_uv).a * c.a);
    return;
  }
  // 14: flat colour (polygons and gradient quads) falls through with a = 1.
  o = vec4(c.rgb, 1.0) * (a * c.a);
}
`;
