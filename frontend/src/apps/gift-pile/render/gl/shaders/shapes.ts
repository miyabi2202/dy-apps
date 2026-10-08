// Everything the removals draw but the pile's icons: textured sprites and anti-aliased
// primitives, one program. Each vertex says what its shape is (`a_kind`), the shape's
// numbers (`a_p`, `a_q`), and where it is in the shape, in px from its centre (`a_local`),
// so the fragment shader can work out the signed distance to the edge and cover the edge by it.

import { NOISE_GLSL } from './noise';
import {
  PM_GHOST_GLSL,
  PM_LANE_GLSL,
  PM_PAC_MAN_GLSL,
  PM_PELLET_GLSL,
  PM_POP_GLSL,
} from './pac-man';
import { BEAM_GLSL, SAUCER_GLSL } from './ufo';

/** What shape a vertex belongs to; the same numbers as `KIND` in `shape-batch.ts`. */
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

export const SHAPES_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
in vec2 v_local;
flat in float v_kind;
flat in vec4 v_p;
flat in vec4 v_q;
uniform sampler2D u_tex;
uniform float u_time; // ms
uniform float u_px;   // world px per device px
out vec4 o;

const float TAU = 6.2831853;

vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// Coverage of an edge at signed distance d (px, negative inside), feathered over at least a device px.
float cover(float d, float feather) {
  float f = max(u_px * 0.75, feather);
  return 1.0 - smoothstep(-f, f, d);
}

// An outline of width v_q.x centred on the edge, when there is one.
float outline(float d) {
  return v_q.x > 0.0 ? abs(d) - v_q.x * 0.5 : d;
}

${NOISE_GLSL}${SAUCER_GLSL}${BEAM_GLSL}${PM_PAC_MAN_GLSL}${PM_GHOST_GLSL}${PM_PELLET_GLSL}${PM_LANE_GLSL}${PM_POP_GLSL}
void main() {
  int k = int(v_kind + 0.5);
  vec4 c = v_color; // straight alpha
  float a = 1.0;

  if (k == 0) { // textured sprite, tinted; q.x set: scrolled by q.yz, wrapping round
    vec4 t;
    if (v_q.x > 0.0) {
      vec2 uv = fract(v_uv + v_q.yz);
      t = textureGrad(u_tex, uv, dFdx(v_uv), dFdy(v_uv));
    } else {
      t = texture(u_tex, v_uv);
    }
    o = t * vec4(c.rgb, 1.0) * c.a;
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
  } else if (k == 13) { // black hole: p.x horizon radius, p.yzw disk colour, q.x light; c the outer glow
    vec2 p = v_local / v_p.x;
    float r = length(p);
    float horizon = cover((r - 1.0) * v_p.x, 0.0);
    // The disk lies flat, tilted: its own radius and angle are those of the stretched plane.
    const float TILT = -0.2;
    vec2 d = mat2(cos(TILT), -sin(TILT), sin(TILT), cos(TILT)) * p;
    vec2 e = vec2(d.x, d.y / 0.35);
    float rd = length(e);
    float ang = atan(e.y, e.x);
    float band = 0.6 + 0.4 * sin(8.0 * ang + 4.0 * rd - u_time * 0.004);
    band *= 0.75 + 0.25 * sin(23.0 * rd - u_time * 0.003);
    float doppler = 1.0 + 0.6 * sin(ang);
    float ring = smoothstep(1.35, 1.6, rd) * (1.0 - smoothstep(2.9, 3.6, rd));
    float heat = ring * band * doppler;
    vec3 diskColor = mix(vec3(1.0, 0.96, 0.85), v_p.yzw, smoothstep(1.4, 2.3, rd));
    diskColor = mix(diskColor, c.rgb, smoothstep(2.3, 3.5, rd));
    float diskA = clamp(heat * v_q.x, 0.0, 1.0);
    // Light bent round the hole: a thin white-hot ring on the horizon, and a faint halo.
    float photon = exp(-pow((r - 1.08) / 0.045, 2.0)) * v_q.x;
    float halo = pow(clamp(1.0 - r / 3.8, 0.0, 1.0), 2.0) * 0.3 * v_q.x;
    // Premultiplied: the halo, then the disk (behind the hole where it is above it, in front below),
    // the horizon black, the photon ring over all.
    vec4 col = vec4(c.rgb * halo, halo * c.a);
    vec4 disk = vec4(diskColor * diskA, diskA);
    vec4 hole = vec4(0.0, 0.0, 0.0, horizon * v_q.x);
    if (d.y > 0.0) {
      col = col * (1.0 - hole.a) + hole;
      col = col * (1.0 - disk.a) + disk;
    } else {
      col = col * (1.0 - disk.a) + disk;
      col = col * (1.0 - hole.a) + hole;
    }
    col += vec4(vec3(photon), photon);
    o = col * c.a;
    return;
  } else if (k == 15) { // saucer: p.x radius, p.yzw hull tint, q.xyz dome colour, q.w glow; c the lights
    o = saucerColor(v_local, v_p.x, v_p.yzw, v_q.xyz, c.rgb, v_q.w, u_time, u_px) * c.a;
    return;
  } else if (k == 16) { // plasma beam: p.x half width at the top, p.y at the foot, p.z length, p.w strength; c the colour
    o = beamColor(v_local, v_p.x, v_p.y, v_p.z, v_p.w, c.rgb, u_time) * c.a;
    return;
  } else if (k == 40) { // Pac-Man: p.x radius, p.y mouth half angle, p.z facing, p.w glow; q.xyz colour, q.w dying; c the lips
    o = pmPacMan(v_local, v_p.x, v_p.y, v_p.z, v_p.w, v_q.xyz, v_q.w, c.rgb, u_time, u_px) * c.a;
    return;
  } else if (k == 41) { // ghost: p.x half width, p.y scared, p.zw where it looks; q.xyz colour
    o = pmGhost(v_local, v_p.x, v_p.y, v_p.zw, v_q.xyz, u_time, u_px) * c.a;
    return;
  } else if (k == 42) { // pellet: p.x radius, p.y power, p.z phase; q.xyz colour
    o = pmPellet(v_local, v_p.x, v_p.y, v_p.z, v_q.xyz, u_time) * c.a;
    return;
  } else if (k == 43) { // neon lane: p.x ahead, p.y behind, p.z half width, p.w strength; q.xyz colour
    o = pmLane(v_local, v_p.x, v_p.y, v_p.z, v_p.w, v_q.xyz, u_time) * c.a;
    return;
  } else if (k == 44) { // pop: p.x radius, p.y progress; q.xyz colour
    o = pmPop(v_local, v_p.x, v_p.y, v_q.xyz) * c.a;
    return;
  } else if (k == 9) { // holographic sheen: p.x angle, p.y strength
    vec4 t = texture(u_tex, v_uv);
    float band = fract(dot(v_uv, vec2(cos(v_p.x), sin(v_p.x))) * 1.5 - u_time * 0.0004);
    vec3 rainbow = hue(band) * smoothstep(0.35, 0.5, band) * smoothstep(0.65, 0.5, band);
    o = (t + vec4(rainbow * t.a * v_p.y, 0.0)) * c.a;
    return;
  } else if (k == 10) { // metal: p.y strength
    vec4 t = texture(u_tex, v_uv);
    float s = fract(v_uv.x - v_uv.y * 0.5 - u_time * 0.0003);
    float spec = smoothstep(0.42, 0.5, s) * smoothstep(0.58, 0.5, s);
    float shade = mix(1.0, 0.75, v_uv.y);
    o = (vec4(t.rgb * shade, t.a) + vec4(vec3(spec * v_p.y * t.a), 0.0)) * c.a;
    return;
  } else if (k == 11) { // rim light: p.xy uv offset, p.z strength; colour is the rim's
    vec4 t = texture(u_tex, v_uv);
    float a1 = texture(u_tex, v_uv - v_p.xy).a;
    float rim = clamp(t.a - a1, 0.0, 1.0) * t.a;
    o = (t + vec4(c.rgb * rim * v_p.z, 0.0)) * v_q.x;
    return;
  } else if (k == 12) { // solid: the sprite's shape in one colour
    o = vec4(c.rgb, 1.0) * (texture(u_tex, v_uv).a * c.a);
    return;
  }
  // 14: flat colour (polygons and gradient quads) falls through with a = 1.
  o = vec4(c.rgb, 1.0) * (a * c.a);
}
`;
