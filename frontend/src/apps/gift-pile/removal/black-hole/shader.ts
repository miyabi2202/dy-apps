import { parseColor } from '../../render/color';
import type { Color, Gfx, ShaderSource } from '../board';

// The black hole and its pop, drawn entirely in GLSL through `Gfx.shade`. Each source's
// `shade()` gets its position in px from the box's middle and returns a premultiplied colour;
// the prelude (`render/gl/shaders/prelude.ts`) supplies `snoise`.

/**
 * A black hole in a box eight horizon radii (`R` px) to a side, after Gargantua. A pure black
 * horizon with a thin white photon ring; an accretion disk seen almost edge on, its turbulence
 * domain-warped noise swirling faster the nearer in (hot white-blue inside, the disk colour and
 * then deeper out), one side beamed brighter; the disk's far side bent over the top and under
 * the bottom of the horizon; a faint halo of the glow colour and a flickering jet each way.
 * `open` (0 to 1) scales its light.
 */
export const BLACK_HOLE_SHADER: ShaderSource = {
  key: 'black-hole/hole',
  glsl: `
// The disk's colour at temperature T (1 at its inner edge, 0 out at its rim).
vec3 diskRamp(float T, vec3 tint) {
  vec3 outer = tint * tint * 0.7;
  vec3 c = mix(outer, tint, smoothstep(0.0, 0.38, T));
  c = mix(c, mix(tint, vec3(1.0, 0.97, 0.9), 0.75), smoothstep(0.3, 0.72, T));
  return mix(c, vec3(0.72, 0.84, 1.0), smoothstep(0.74, 1.0, T) * 0.65 + 0.2 * smoothstep(0.9, 1.0, T));
}

// Light from the disk at radius rd (in horizon radii) and azimuth th: rgb is the light, a how much of it blocks what is behind.
vec4 diskLight(float rd, float th, float t, vec3 tint) {
  float s = t * 0.001;
  // Differential rotation: the inside turns much faster than the rim, so the pattern shears into spirals.
  float a = th - 5.2 * pow(rd, -1.5) * s;
  vec2 q = rd * vec2(cos(a), sin(a));
  vec2 w = vec2(snoise(q * 0.6 + vec2(0.0, s * 0.2)), snoise(q * 0.6 + vec2(7.3, 2.1 - s * 0.2)));
  float n1 = snoise(q * 1.0 + w * 1.2);
  float n2 = snoise(q * 2.2 + w * 1.6 + vec2(3.0, -s * 0.3));
  float turb = 0.55 + 0.36 * n1 + 0.09 * n2;
  float rings = 0.5 + 0.5 * sin(rd * 9.0 + n1 * 2.5);
  float dens = smoothstep(0.08, 0.95, turb) * (0.72 + 0.28 * rings);
  float T = pow(clamp((6.0 - rd) / 4.5, 0.0, 1.0), 1.35);
  // Beaming: the side coming towards us is much brighter, and bluer.
  float c = cos(th);
  float beam = pow(clamp(1.0 - 0.52 * c, 0.0, 2.0), 1.9);
  T = clamp(T - 0.16 * c, 0.0, 1.0);
  float fade = smoothstep(1.38, 1.62, rd) * (1.0 - smoothstep(4.6, 6.2, rd));
  float I = (0.2 + 1.35 * dens) * pow(T, 0.8) * beam * fade;
  vec3 col = diskRamp(T, tint) * I;
  return vec4(col, clamp(I * 0.9, 0.0, 1.0));
}

vec4 blackHoleColor(vec2 pl, float R, vec3 tint, vec3 glowCol, float open, float t, float px) {
  const float TILT = -0.1;
  const float EPS = 0.2; // how flat the disk is, seen from where we are
  vec2 p = pl / R;
  p = mat2(cos(TILT), -sin(TILT), sin(TILT), cos(TILT)) * p;
  float rho = length(p);
  float phi = atan(p.y, p.x);
  float aa = px * 0.75 / R;
  vec4 col = vec4(0.0);

  // --- the halo of light round it, and its jets ---
  float halo = exp(-max(rho - 1.0, 0.0) * 0.75) * smoothstep(8.0, 3.0, rho);
  float pushed = 0.7 + 0.3 * sin(phi + 0.6);
  col += vec4(glowCol * halo * 0.2 * pushed, halo * 0.1);
  float ay = abs(p.y);
  float jw = 0.05 + 0.035 * ay;
  float flick = 0.55 + 0.45 * snoise(vec2(ay * 1.4 - t * 0.0045, 4.0 + sign(p.y) * 3.0));
  float jet = exp(-pow(p.x / jw, 2.0)) * smoothstep(1.1, 1.7, ay) * (1.0 - smoothstep(2.5, 7.0, ay)) * flick;
  col += vec4(mix(glowCol, vec3(0.75, 0.88, 1.0), 0.6) * jet * 0.3, 0.0);

  // --- the far side of the disk, as seen round the edge of the hole ---
  // Its light is bent over the top, and a fainter image under the bottom; they run from the
  // inner edge of the disk (at the photon ring) outwards.
  float rl = 1.42 + (rho - 1.05) * 3.0;
  float arcMask = smoothstep(1.02, 1.1, rho) * (1.0 - smoothstep(2.1, 2.9, rho));
  float topW = smoothstep(0.0, 0.55, -p.y / rho);
  float botW = 0.45 * smoothstep(0.1, 0.8, p.y / rho);
  if (arcMask > 0.0) {
    vec4 arc = diskLight(rl, phi, t, tint);
    col = vec4(arc.rgb * 1.5, arc.a) * (arcMask * (topW + botW)) * 1.0 + col * (1.0 - arc.a * arcMask * (topW + botW));
  }

  // --- the disk itself, flat: the far half behind the horizon, the near half in front of it ---
  vec2 ed = vec2(p.x, p.y / EPS);
  float rd = length(ed);
  float th = atan(ed.y, ed.x);
  vec4 disk = vec4(0.0);
  if (rd > 1.3 && rd < 6.4) disk = diskLight(rd, th, t, tint);
  // A faint soft edge in the thin direction so the plane doesn't alias.
  disk *= smoothstep(0.0, 0.03, abs(p.y) + 0.02);
  // Seen in front of the horizon it is a thin band: the deeper bits would be the disk's far reaches.
  disk *= 1.0 - smoothstep(0.5, 0.75, p.y) * step(rho, 1.0 + 0.0001);
  bool near = ed.y > 0.0;
  if (!near) col = disk + col * (1.0 - disk.a);

  // --- the horizon: pure black ---
  float horizon = 1.0 - smoothstep(-aa, aa, rho - 1.0);
  col = vec4(0.0, 0.0, 0.0, 1.0) * horizon + col * (1.0 - horizon);

  if (near) col = disk + col * (1.0 - disk.a);

  // --- the photon ring: light that has gone round the hole, thin and white-hot ---
  float beamRing = 0.78 - 0.4 * cos(phi);
  float ring = exp(-pow((rho - 1.03) / 0.016, 2.0)) * 1.9 + exp(-pow((rho - 1.03) / 0.07, 2.0)) * 0.45;
  ring *= beamRing * smoothstep(0.96, 1.0, rho);
  col += vec4(mix(vec3(1.0), vec3(0.8, 0.9, 1.0), 0.4) * ring, ring * 0.8);

  col.a = min(col.a, 1.0);
  return col * open;
}

vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  return blackHoleColor(p, P.x, P.yzw, color, Q.x, u_time, v_px);
}
`,
};

/**
 * The pop as the hole collapses, in a box `R` px to each side, `u` (0 to 1) of the way through:
 * a white-hot flash with a flare across it, a shockwave ring with its colours split (red out,
 * blue in) and a faint second ring and rays of `color` behind it. Additive.
 */
export const BLACK_HOLE_POP_SHADER: ShaderSource = {
  key: 'black-hole/pop',
  glsl: `
vec4 blackHolePopColor(vec2 p, float R, float u, vec3 col, float t, float px) {
  float r = length(p);
  float rr = max(R * 0.9 * (1.0 - pow(1.0 - u, 2.6)), 3.0 * px);
  float live = 1.0 - u;
  // The flash: a white core that blows out fast.
  float core = R * (0.05 + 0.2 * sqrt(u));
  float flash = exp(-r * r / (core * core)) * pow(live, 1.6) * 2.4;
  flash += exp(-r / (R * 0.12)) * pow(live, 3.0) * 0.7;
  // A flare drawn across it, wide and thin, and a short one up and down.
  float flare = exp(-abs(p.y) / (R * 0.012)) * exp(-abs(p.x) / (R * 0.55)) * pow(live, 2.0) * 1.6;
  flare += exp(-abs(p.x) / (R * 0.01)) * exp(-abs(p.y) / (R * 0.22)) * pow(live, 2.5) * 0.8;
  vec3 rgb = mix(col, vec3(1.0), 0.85) * (flash + flare);
  // The shockwave: one ring, its colours pulled apart.
  float w = R * (0.03 + 0.06 * u);
  float amp = pow(live, 1.2) * 1.5;
  vec3 ring = vec3(
    exp(-pow((r - rr * 1.035) / w, 2.0)),
    exp(-pow((r - rr) / w, 2.0)),
    exp(-pow((r - rr * 0.965) / w, 2.0))
  );
  rgb += ring * amp * vec3(1.0, 0.9, 1.0);
  // A fainter, slower ring inside it and the haze it leaves.
  float r2 = rr * 0.62;
  rgb += mix(col, vec3(1.0), 0.4) * exp(-pow((r - r2) / (w * 1.6), 2.0)) * pow(live, 1.5) * 0.55;
  rgb += col * smoothstep(rr, rr * 0.2, r) * pow(live, 2.2) * 0.35;
  // Rays out of the middle, in the noise of their angle.
  vec2 dir = p / max(r, 0.001);
  float rays = pow(0.5 + 0.5 * snoise(dir * 3.2 + vec2(t * 0.0005, 1.0)), 3.0);
  rgb += mix(col, vec3(1.0), 0.6) * rays * smoothstep(rr * 1.0, rr * 0.3, r) * smoothstep(0.0, R * 0.1, r) * pow(live, 2.0) * 0.8;
  rgb *= 1.0 - smoothstep(R * 0.85, R, max(abs(p.x), abs(p.y)));
  return vec4(rgb, 0.0);
}

vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  return blackHolePopColor(p, P.x, P.y, color, u_time, v_px);
}
`,
};

/** What the black-hole remover compiles at startup. */
export const BLACK_HOLE_SHADERS: readonly ShaderSource[] = [
  BLACK_HOLE_SHADER,
  BLACK_HOLE_POP_SHADER,
];

/** The hole, `r` px to its horizon when fully open, `open` 0 to 1, with its glow and disk colours. */
export function drawBlackHole(
  gfx: Gfx,
  x: number,
  y: number,
  r: number,
  open: number,
  colors: { glow: Color; disk: Color },
): void {
  const hole = r * Math.min(1, open);
  if (hole <= 0.01) return;
  const [dr, dg, db] = parseColor(colors.disk);
  const half = hole * 8;
  gfx.shade(
    BLACK_HOLE_SHADER,
    { x, y, halfW: half, halfH: half },
    { p: [hole, dr, dg, db], q: [Math.min(1, open)], color: colors.glow },
  );
}

/** The pop `radius` px across to each side, `u` 0 to 1 of the way through, in `color`. */
export function drawBlackHolePop(
  gfx: Gfx,
  x: number,
  y: number,
  radius: number,
  u: number,
  color: Color,
): void {
  if (u >= 1 || radius <= 0) return;
  gfx.shade(
    BLACK_HOLE_POP_SHADER,
    { x, y, halfW: radius, halfH: radius },
    { p: [radius, Math.max(0, u)], color, blend: 'add' },
  );
}
