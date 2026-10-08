// The finished scene, drawn to the canvas, with the effects that bend or tint the whole view:
// shockwaves, a lens, heat haze, a colour split, bloom, a flash. The bloom is made from the
// scene by a bright pass and two blurs (`BRIGHT_FS`, `BLUR_FS`) first.

export const POST_VS = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  // One big triangle covering the screen.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const POST_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform vec4 u_frame;          // view top, world width, world height, time (ms)
uniform vec4 u_shock[4];       // x, y, radius, width (world px, on screen)
uniform float u_shockStrength[4];
uniform int u_shocks;
uniform vec4 u_lens;           // x, y, radius, strength
uniform vec4 u_haze[2];        // left, top, width, height
uniform float u_hazeStrength[2];
uniform int u_hazes;
uniform float u_aberration;
uniform float u_bloomStrength;
uniform vec4 u_flash;          // premultiplied colour, alpha
out vec4 o;

void main() {
  vec2 size = u_frame.yz;
  // Where this pixel is in the world, and the point of the scene it will show: moved about by each effect.
  vec2 w = vec2(v_uv.x * size.x, u_frame.x + (1.0 - v_uv.y) * size.y);
  vec2 at = w;

  // Shockwaves: a ring that pushes what is under it outwards.
  for (int i = 0; i < 4; i++) {
    if (i >= u_shocks) break;
    vec2 d = w - u_shock[i].xy;
    float r = length(d);
    float x = (r - u_shock[i].z) / max(1.0, u_shock[i].w);
    at -= d / max(r, 1.0) * exp(-x * x) * u_shockStrength[i];
  }

  // Lens: what is near the centre is pulled in towards it, most at the middle.
  if (u_lens.w > 0.0) {
    vec2 d = w - u_lens.xy;
    float pull = clamp(1.0 - length(d) / max(u_lens.z, 1.0), 0.0, 1.0);
    at += d * (u_lens.w * pull * pull * 0.6);
  }

  // Heat haze: a shimmer rising through each rectangle, faded out at its edges.
  for (int i = 0; i < 2; i++) {
    if (i >= u_hazes) break;
    vec4 r = u_haze[i];
    vec2 inside = min(w - r.xy, r.xy + r.zw - w);
    float edge = max(1.0, min(r.z, r.w) * 0.4);
    float mask = smoothstep(0.0, edge, min(inside.x, inside.y));
    float s = u_hazeStrength[i] * mask;
    at.x += sin(w.y * 0.15 + u_frame.w * 0.012) * s * 3.0;
    at.y += sin(w.x * 0.2 + u_frame.w * 0.009) * s * 1.5;
  }

  vec2 uv = vec2(at.x / size.x, 1.0 - (at.y - u_frame.x) / size.y);
  vec4 c = texture(u_scene, uv);

  // Chromatic aberration: red and blue pushed apart along the way out from the middle.
  if (u_aberration > 0.0) {
    vec2 dir = (uv - 0.5) * u_aberration * 0.04;
    vec4 r = texture(u_scene, uv + dir);
    vec4 b = texture(u_scene, uv - dir);
    c = vec4(r.r, c.g, b.b, max(c.a, max(r.a, b.a)));
  }

  // Bloom is light: it adds to the colour, and to how much is there.
  if (u_bloomStrength > 0.0) {
    vec3 glow = texture(u_bloom, uv).rgb * u_bloomStrength;
    c = vec4(c.rgb + glow, clamp(c.a + max(glow.r, max(glow.g, glow.b)), 0.0, 1.0));
  }

  // A flash covers everything, the empty canvas too.
  o = c * (1.0 - u_flash.a) + u_flash;
}
`;

/** Keeps what is brighter than a threshold, for the bloom. */
export const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
out vec4 o;
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float keep = max(0.0, lum - 0.75) / max(lum, 0.0001);
  o = vec4(c * keep, 1.0);
}
`;

/** One direction of a 9-tap Gaussian blur; u_step is the texel to step by, in uv. */
export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_step;
out vec4 o;
void main() {
  vec3 sum = texture(u_src, v_uv).rgb * 0.227027;
  sum += (texture(u_src, v_uv + u_step).rgb + texture(u_src, v_uv - u_step).rgb) * 0.1945946;
  sum += (texture(u_src, v_uv + u_step * 2.0).rgb + texture(u_src, v_uv - u_step * 2.0).rgb) * 0.1216216;
  sum += (texture(u_src, v_uv + u_step * 3.0).rgb + texture(u_src, v_uv - u_step * 3.0).rgb) * 0.054054;
  sum += (texture(u_src, v_uv + u_step * 4.0).rgb + texture(u_src, v_uv - u_step * 4.0).rgb) * 0.016216;
  o = vec4(sum, 1.0);
}
`;
