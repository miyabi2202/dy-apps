import type { Color, Gfx, ShaderSource } from '../board';

// The spell's light and what it leaves, drawn in GLSL through `Gfx.shade`: the bolt from the
// wand, and the small puffs of black smoke the icons vanish in. Each source's
// `shade()` gets its position in px from the box's middle and returns a premultiplied colour;
// the prelude (`render/gl/shaders/prelude.ts`) supplies `snoise`, `hash12` and `TAU`.

/**
 * The bolt: a streak of light lying along the box's x axis, its head at +x, thin and faint at
 * its tail, with filaments of light twisting round its core and a bright head.
 */
export const BOLT_SHADER: ShaderSource = {
  key: 'evanesco/bolt',
  glsl: `
// P: half its length, its width at the head, strength. color: the spell's.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  float halfLen = P.x;
  float w = P.y;
  float t = u_time;
  // 0 at the tail, 1 at the head.
  float u = clamp((p.x + halfLen) / (2.0 * halfLen), 0.0, 1.0);
  float width = w * (0.15 + 0.85 * u * u);
  float core = exp(-pow(p.y / max(0.6, width * 0.35), 2.0));
  float sheath = exp(-pow(p.y / max(1.0, width), 2.0));
  // Two filaments winding round the core, drifting back along it.
  float f1 = exp(-pow((p.y - sin(p.x * 0.11 - t * 0.04) * width * 0.7) / 1.1, 2.0));
  float f2 = exp(-pow((p.y + sin(p.x * 0.083 - t * 0.031 + 1.7) * width * 0.6) / 1.1, 2.0));
  float crackle = 0.6 + 0.4 * snoise(vec2(p.x * 0.06 - t * 0.02, p.y * 0.2));
  float along = u * u * smoothstep(1.0, 0.97, u);
  vec3 rgb = vec3(1.0) * core * 1.4 + color * (sheath * 0.7 + (f1 + f2) * 0.6 * crackle);
  rgb *= along;
  // The head: a white-hot knot of light.
  vec2 h = p - vec2(halfLen - w * 0.6, 0.0);
  float head = exp(-dot(h, h) / (w * w * 0.35));
  rgb += (vec3(1.0) * 1.2 + color) * head;
  return vec4(rgb * P.z, 0.0);
}
`,
};

/**
 * A small puff of black smoke, eaten into by noise that drifts through it. Drawn many at a
 * time, over the picture (not added), so it darkens what it covers as smoke does.
 */
export const SMOKE_SHADER: ShaderSource = {
  key: 'evanesco/smoke',
  glsl: `
// P: radius, how far through its life (0 to 1), a seed.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  float r = max(P.x, 0.5);
  float u = P.y;
  float seed = P.z;
  vec2 q = p / r;
  float t = u_time * 0.0004;
  float n = snoise(q * 1.6 + vec2(seed, seed * 0.7 - t)) * 0.5
          + snoise(q * 3.4 + vec2(-seed, t * 1.6)) * 0.25;
  float d = length(q) + n * 0.45;
  float a = smoothstep(1.0, 0.35, d);
  a *= smoothstep(0.0, 0.08, u) * (1.0 - u) * (1.0 - u) * 0.85;
  // Black, a little lighter where its billows catch the light.
  vec3 smoke = mix(vec3(0.16, 0.15, 0.18), vec3(0.03, 0.03, 0.04), clamp(0.5 + q.y * 0.3 + n * 0.4, 0.0, 1.0));
  return vec4(smoke * a, a);
}
`,
};

/** What the Evanesco remover compiles at startup. */
export const EVANESCO_SHADERS: readonly ShaderSource[] = [BOLT_SHADER, SMOKE_SHADER];

/** The bolt from (x0, y0) with its head at (x1, y1), `width` across at the head. */
export function drawBolt(
  gfx: Gfx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  strength: number,
  color: Color,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (length < 1 || strength <= 0) return;
  const half = length / 2;
  gfx.shade(
    BOLT_SHADER,
    {
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      // Room past the head for its glow.
      halfW: half + width * 2,
      halfH: width * 2.2,
      rotation: Math.atan2(dy, dx),
    },
    { p: [half, width, strength], color, blend: 'add' },
  );
}

/** How far a puff's box reaches, in its radii. */
export const SMOKE_BOX = 1.3;
