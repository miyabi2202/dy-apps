// GLSL every `ShaderSource` can use (see `shade.ts`, which puts it ahead of the source's own
// code). The simplex noise `snoise` is the vendored one in `noise.ts` (MIT; its licence is kept
// there). It needs `v_px` (caller units per device pixel) and `u_time` (ms) declared before it,
// which `shade.ts` does.

import { NOISE_GLSL } from './noise';

export const PRELUDE_GLSL = `
const float TAU = 6.2831853;

// A colour from a hue h in 0..1, fully saturated.
vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// Coverage (0 to 1) of an edge at signed distance d (negative inside), feathered over a device
// pixel, or over \`feather\` if that is wider. Same units as d.
float cover(float d) {
  float f = v_px * 0.75;
  return 1.0 - smoothstep(-f, f, d);
}
float cover(float d, float feather) {
  float f = max(v_px * 0.75, feather);
  return 1.0 - smoothstep(-f, f, d);
}

// Over: top above bottom, both premultiplied.
vec4 over(vec4 top, vec4 bottom) {
  return top + bottom * (1.0 - top.a);
}

// A cheap 2-D hash of a cell, 0 to 1.
float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Signed distance to a box with half sizes b, centred on the origin.
float sdBox(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// Signed distance to an ellipse with radii r, centred on the origin (a close approximation).
float sdEllipse(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k1 > 1e-6 ? k0 * (k0 - 1.0) / k1 : -min(r.x, r.y);
}

// Distance to the segment a to b (0 on it; subtract a radius for a capsule).
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// Smooth minimum of a and b, blended over k.
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// The studio a shiny surface mirrors, as a handful of colours and a light panel. \`y\` is where the
// reflection points (negative is up), \`x\` across it, \`t\` in ms. Fill one in per material; the
// zenith fades to the horizon above the horizon line, the ground to the nadir below it.
struct Sky {
  vec3 zenith;
  vec3 horizon;
  vec3 ground;
  vec3 nadir;
  vec3 strip;      // the bright line at the horizon
  float stripW;    // its half width
  float stripGain;
  float panelY;    // a soft box up in the sky: how high, how thick (0.07 is usual)...
  float panelThick;
  float panelSpan; // ...how wide (0.3 is usual), where across, how far it sways with t, and how bright
  float panelX;
  float sway;
  float panelGain;
};

vec3 envSky(float y, float x, float t, Sky s) {
  vec3 sky = mix(s.horizon, s.zenith, pow(clamp(-y * 1.15, 0.0, 1.0), 0.7));
  vec3 ground = mix(s.ground, s.nadir, pow(clamp(y * 1.4, 0.0, 1.0), 0.6));
  vec3 env = mix(sky, ground, smoothstep(-0.05, 0.07, y));
  env += s.strip * exp(-pow((y + 0.03) / s.stripW, 2.0)) * s.stripGain;
  float panel = smoothstep(s.panelThick, 0.02, abs(y + s.panelY))
              * smoothstep(s.panelSpan, s.panelSpan / 3.0, abs(x * 0.6 - s.panelX + 0.2 * sin(t * s.sway)));
  return env + vec3(panel * s.panelGain);
}
${NOISE_GLSL}`;
