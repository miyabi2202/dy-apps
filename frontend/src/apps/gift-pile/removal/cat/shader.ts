import type { Color, Gfx, ShaderSource } from '../board';

// The smear a cat's paw leaves as it swats, drawn in GLSL through `Gfx.shade`. Its `shade()`
// gets its position in px from the box's middle and returns a premultiplied colour; the
// prelude (`render/gl/shaders/prelude.ts`) supplies `cover` and `TAU`.

/**
 * A swat's smear: a crescent round the shoulder, thick and solid just behind the paw and
 * thinning and fading back along the way it came, streaked like an anime motion smear, and
 * shading from one neon colour at the paw to another at its tail.
 */
export const SWOOSH_SHADER: ShaderSource = {
  key: 'cat/swoosh',
  glsl: `
// P: the arc's radius, its thickness at the paw, the paw's angle now, and how far round behind
// it the smear reaches (radians, signed: + when the paw turns clockwise). Q.x: strength;
// Q.yzw: the colour at its tail (straight rgb), shading from the colour at the paw.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float dir = P.w < 0.0 ? -1.0 : 1.0;
  float reach = max(abs(P.w), 1e-3);
  // How far behind the paw this point is, round the way it came, as a share of the smear.
  float behind = mod((P.z - a) * dir, TAU);
  if (behind > reach) return vec4(0.0);
  float u = behind / reach;
  float w = P.y * (1.0 - u) * (1.0 - 0.4 * u) + 0.6;
  // The inner edge creeps out towards the tail, so it tapers into a crescent.
  float mid = P.x - P.y * 0.25 * (1.0 - u);
  float d = abs(r - mid) - w * 0.5;
  float streak = 0.72 + 0.28 * sin(r * 1.9 + u * 4.0);
  float alpha = cover(d, 0.8) * pow(1.0 - u, 1.3) * smoothstep(0.0, 0.04, u) * streak * Q.x;
  vec3 tint = mix(color, Q.yzw, smoothstep(0.0, 0.8, u));
  return vec4(tint * alpha, alpha);
}
`,
};

/** What the cat compiles at startup. */
export const CAT_SHADERS: readonly ShaderSource[] = [SWOOSH_SHADER];

/** One swat's smear: round (x, y) at `radius`, the paw now at `angle`, having come `reach` radians round behind it, `color` at the paw and `tail` (0–1 rgb) behind. */
export function drawSwoosh(
  gfx: Gfx,
  x: number,
  y: number,
  radius: number,
  thickness: number,
  angle: number,
  reach: number,
  strength: number,
  color: Color,
  tail: readonly [number, number, number],
): void {
  if (strength <= 0 || Math.abs(reach) < 0.05) return;
  const half = radius + thickness + 4;
  gfx.shade(
    SWOOSH_SHADER,
    { x, y, halfW: half, halfH: half },
    { p: [radius, thickness, angle, reach], q: [strength, ...tail], color },
  );
}
