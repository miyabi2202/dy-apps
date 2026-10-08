import type { Color, Gfx, ShaderSource } from '../board';
import { parseColor } from '../../render/color';

// The hot-air balloon, drawn entirely in GLSL through `Gfx.shade`: a silk envelope of gore
// panels with patterns, the burner's light glowing through it, a woven wicker basket on its
// ropes, a noise-driven flame and the heat above it. Each source's `shade()` gets its position
// in px from the box's middle and returns a premultiplied colour; the prelude supplies `snoise`,
// `TAU`, `cover`, `sdBox` and `sdSegment`. All the sizes follow the envelope's radius `R`, as the
// 30 px balloon they were drawn for.

/**
 * The envelope and its skirt, `R` px to its sides, centred on the envelope's middle: the
 * skirt's throat is `1.4 R` below. `P` is `R` and the gores' first three colours, `Q.x` the
 * fourth, each packed as `r * 65536 + g * 256 + b` (0 to 255 each) and taken in turn; `Q.y` is
 * the skirt's colour; `Q.z` the number of gore colours plus 8 times the pattern (0 plain, 1
 * bands, 2 chevrons, 3 stars); `Q.w` is `heat` (0 to 1), how much the burner lights it from
 * inside. `color` is the outline.
 */
export const ENVELOPE_SHADER: ShaderSource = {
  key: 'balloon/envelope',
  glsl: `
vec3 balUnpack(float f) {
  return vec3(floor(f / 65536.0), mod(floor(f / 256.0), 256.0), mod(f, 256.0)) / 255.0;
}

// Half the envelope's width at depth y (in R): a sphere that draws in to the skirt's throat.
float balHalf(float y) {
  const float K = 0.55;
  const float BOTTOM = 1.4;
  const float THROAT = 0.2;
  if (y < K) return sqrt(max(1.0 - y * y, 0.0));
  float t = clamp((y - K) / (BOTTOM - K), 0.0, 1.0);
  float w0 = sqrt(1.0 - K * K);
  return THROAT + (w0 - THROAT) * pow(1.0 - t, 1.15);
}

float balStar(vec2 s, float r) {
  float a = atan(s.y, s.x) + 1.5707963;
  float m = abs(mod(a, TAU / 5.0) - TAU / 10.0) / (TAU / 10.0);
  return (length(s) - r * mix(0.42, 1.0, m)) * 0.8;
}

vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 outlineCol) {
  float R = P.x;
  vec3 s03 = P.yzw;
  float s3 = Q.x;
  float skirtP = Q.y;
  float meta = Q.z;
  float heat = Q.w;
  vec2 q = p / R;
  float y = q.y;
  float w = balHalf(y);
  float wp = clamp((balHalf(y + 0.01) - balHalf(y - 0.01)) / 0.02, -8.0, 8.0);
  float d = max((abs(q.x) - w) / sqrt(1.0 + wp * wp) * R, (y - 1.4) * R);
  if (y < 0.5) d = (length(q) - 1.0) * R;
  if (d > 3.0) return vec4(0.0);
  float cov = cover(d);
  float aq = v_px / R;

  // Which gore, and where across it.
  float sx = clamp(q.x / max(w, 0.08), -1.0, 1.0);
  float theta = asin(sx);
  const float G = 8.0;
  float gu = (theta / 3.14159265 + 0.5) * G;
  float gi = clamp(floor(gu), 0.0, G - 1.0);
  float gf = fract(gu);
  float cth = cos(theta);
  float gorePx = max(R * max(w, 0.05) * max(cth, 0.05) * 3.14159265 / G, 0.5);

  float pattern = floor(meta / 8.0);
  float n = max(meta - 8.0 * pattern, 1.0);
  int idx = int(mod(gi, n));
  vec3 c0 = balUnpack(s03.x), c1 = balUnpack(s03.y), c2 = balUnpack(s03.z), c3 = balUnpack(s3);
  vec3 base = idx == 0 ? c0 : (idx == 1 ? c1 : (idx == 2 ? c2 : c3));
  vec3 skirtCol = balUnpack(skirtP);
  float lum = dot(base, vec3(0.3, 0.59, 0.11));
  vec3 trim = mix(vec3(1.0, 0.96, 0.86), skirtCol, smoothstep(0.5, 0.72, lum));
  vec3 gold = vec3(1.0, 0.78, 0.32);

  // Decoration, painted on the panels.
  vec3 albedo = base;
  float goldMask = 0.0;
  if (pattern == 1.0) {
    float yb = y - 0.12;
    albedo = mix(albedo, trim, 1.0 - smoothstep(0.075 - aq, 0.075 + aq, abs(yb)));
    goldMask = max(goldMask, 1.0 - smoothstep(0.011 - aq, 0.011 + aq, abs(abs(yb) - 0.095)));
    goldMask = max(goldMask, 1.0 - smoothstep(0.012 - aq, 0.012 + aq, abs(y + 0.55)));
  } else if (pattern == 2.0) {
    float v = y + abs(gf - 0.5) * 0.4;
    albedo = mix(albedo, trim, 1.0 - smoothstep(0.07 - aq, 0.07 + aq, abs(v - 0.1)));
    goldMask = max(goldMask, 1.0 - smoothstep(0.012 - aq, 0.012 + aq, abs(v - 0.27)));
    goldMask = max(goldMask, 1.0 - smoothstep(0.012 - aq, 0.012 + aq, abs(v + 0.42)));
  } else if (pattern == 3.0) {
    float yc = mod(gi, 2.0) < 0.5 ? -0.4 : 0.18;
    vec2 sp = vec2((gf - 0.5) * gorePx, (y - yc) * R);
    float star = cover(balStar(sp, min(gorePx * 0.42, 0.17 * R)));
    albedo = mix(albedo, mix(trim, gold, 0.5), star);
    goldMask = max(goldMask, 1.0 - smoothstep(0.012 - aq, 0.012 + aq, abs(y - 0.66)));
  }
  // The crown cap, and a stitched hem where the skirt hangs.
  albedo = mix(albedo, trim, 1.0 - smoothstep(-0.96, -0.9, y));
  goldMask = max(goldMask, 1.0 - smoothstep(0.012 - aq, 0.012 + aq, abs(y - 0.79)));
  albedo = mix(albedo, gold, goldMask);

  // The skirt.
  float sk = smoothstep(0.795 - aq, 0.795 + aq, y) * (1.0 - goldMask);
  float pleat = sin(sx * 14.0);
  albedo = mix(albedo, skirtCol * (0.86 + 0.14 * pleat), sk);

  // The silk's surface: each gore bulges, so its middle faces forward and its seams turn away.
  float bulge = (gf - 0.5) * 2.0;
  float sinT = clamp(sx + bulge * 0.42 * cth * (1.0 - abs(sx) * 0.3), -1.0, 1.0);
  float radial = inversesqrt(1.0 + wp * wp);
  vec3 N = normalize(vec3(radial * sinT, -wp * radial, radial * sqrt(max(1.0 - sinT * sinT, 0.0))));
  N.xy += vec2(snoise(q * vec2(7.0, 4.0) + 1.3), snoise(q * vec2(7.0, 4.0) + 9.1)) * 0.025;
  N = normalize(N);
  vec3 L = normalize(vec3(-0.55, -0.6, 0.58));
  float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = albedo * (0.3 + 0.95 * wrap * wrap);
  col += vec3(0.05, 0.08, 0.14) * (0.5 - 0.5 * N.y) * 0.5;
  // Sheen: a tight highlight that runs down each gore and a broad soft one.
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(N, H), 0.0);
  float sheen = pow(nh, 36.0) * 0.55 + pow(nh, 7.0) * 0.12;
  col += mix(vec3(1.0), albedo, 0.25) * sheen * (1.0 - sk * 0.6);
  // Fresnel: cool sky light grazing the edge, warm bounce from below.
  float fres = pow(1.0 - N.z, 3.0);
  col += vec3(0.55, 0.75, 1.0) * fres * 0.45;
  col += vec3(1.0, 0.6, 0.35) * fres * 0.2 * smoothstep(0.0, 1.0, N.y);
  // The skirt is shadowed by the envelope.
  col *= 1.0 - 0.35 * sk * (1.0 - smoothstep(0.8, 1.0, y));

  // The burner's light through the cloth: panels glow warm, the seams stay dark.
  vec2 gp = (q - vec2(0.0, 0.8)) * vec2(1.15, 0.85);
  float g = exp(-dot(gp, gp) * 1.8) * heat;
  vec3 trans = albedo * vec3(1.55, 1.0, 0.6) + vec3(0.45, 0.2, 0.05);
  col = mix(col, trans, clamp(g, 0.0, 1.0));
  col += vec3(1.0, 0.55, 0.18) * g * 0.35;
  col += vec3(1.0, 0.5, 0.15) * heat * smoothstep(0.9, 1.4, y) * sk * 0.7;
  float seam = 1.0 - smoothstep(0.15, 0.9, min(gf, 1.0 - gf) * gorePx);
  col *= 1.0 - seam * (0.4 + 0.3 * g) * (1.0 - sk);
  // The open throat, hot inside.
  float hot = smoothstep(1.32, 1.4, y);
  col = mix(col, vec3(0.08, 0.03, 0.02) + vec3(1.0, 0.5, 0.15) * heat, hot * 0.75);

  // A thin dark line round it, and a pale rim outside so it reads against the pile.
  col = mix(col, outlineCol, (1.0 - smoothstep(0.0, 1.3, -d)) * 0.6);
  float rim = (1.0 - smoothstep(0.0, 2.2, max(d, 0.0))) * (1.0 - cov) * 0.7;
  return vec4(col * cov + vec3(0.92, 0.96, 1.0) * rim, cov + rim);
}
`,
};

/**
 * The ropes and the woven basket, centred half way down them, from the throat (`14/30 R` plus
 * the basket's height `12/30 R` of them) to the basket's foot. `P` is `R` and `heat`.
 */
export const BASKET_SHADER: ShaderSource = {
  key: 'balloon/basket',
  glsl: `
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  float R = P.x;
  float heat = P.y;
  float u = R / 30.0;
  float L = 14.0 * u;
  float B = 12.0 * u;
  float hw = 10.0 * u;
  float top = -(L + B) * 0.5;
  float bt = top + L;
  float aa = v_px * 0.75;

  // The ropes down from the throat to the basket's corners, and two lighter between.
  float dr = min(sdSegment(p, vec2(-6.0 * u, top), vec2(-(hw - 2.0 * u), bt + 1.0)),
                 sdSegment(p, vec2(6.0 * u, top), vec2(hw - 2.0 * u, bt + 1.0)));
  dr = min(dr, min(sdSegment(p, vec2(-2.5 * u, top), vec2(-hw * 0.42, bt)),
                   sdSegment(p, vec2(2.5 * u, top), vec2(hw * 0.42, bt))));
  float covR = (1.0 - smoothstep(0.4, 0.4 + aa * 1.5, dr)) * 0.9;
  vec3 ropeCol = vec3(0.93, 0.87, 0.72) * (0.8 + 0.2 * sin(p.y * 2.2 + p.x * 1.3));
  vec4 col = vec4(ropeCol * covR, covR);

  // The basket, a little wider at the top.
  float taper = 1.0 - 0.07 * clamp((p.y - bt) / B, 0.0, 1.0);
  float db = sdBox(p - vec2(0.0, bt + B * 0.5), vec2(hw * taper - 3.0 * u, B * 0.5 - 3.0 * u)) - 3.0 * u;
  float covB = cover(db);
  vec2 bp = vec2(p.x, p.y - bt);
  float nxs = clamp(p.x / (hw * taper), -1.0, 1.0);
  // Strands of cane woven over and under.
  float row = bp.y / (2.4 * u);
  float ri = floor(row);
  float cell = bp.x / (3.2 * u) + 0.5 * mod(ri, 2.0);
  float parity = mod(floor(cell) + ri, 2.0);
  float weave = (0.45 + 0.55 * sin(fract(row) * 3.14159)) * (0.8 + 0.2 * sin(fract(cell) * TAU)) * mix(0.85, 1.05, parity);
  vec3 wick = mix(vec3(0.5, 0.27, 0.09), vec3(0.88, 0.62, 0.29), clamp(weave, 0.0, 1.0));
  wick *= 1.0 + snoise(bp * 0.9) * 0.08;
  float nz = sqrt(max(1.0 - nxs * nxs, 0.0));
  float lit = 0.35 + 0.75 * clamp(nz * 0.8 - nxs * 0.35, 0.0, 1.0);
  wick *= lit * (1.0 - 0.25 * clamp(bp.y / B, 0.0, 1.0));
  // The leather rim on top, stitched.
  float rimH = 2.4 * u;
  float inRim = 1.0 - smoothstep(rimH - aa, rimH + aa, bp.y);
  float stitch = step(fract(bp.x / (1.6 * u)), 0.35) * (1.0 - smoothstep(0.5 * u, 0.5 * u + aa, abs(bp.y - rimH * 0.5)));
  vec3 leather = vec3(0.3, 0.17, 0.08) * lit + vec3(0.9, 0.7, 0.4) * stitch * 0.5;
  vec3 b = mix(wick, leather, inRim);
  // The burner's light on the rim and the cane under it.
  b += vec3(1.0, 0.55, 0.2) * heat * (1.0 - smoothstep(0.0, 5.0 * u, bp.y)) * 0.6;
  b = mix(b, vec3(0.2, 0.1, 0.03), (1.0 - smoothstep(0.0, 1.3, -db)) * 0.6);
  float rim = (1.0 - smoothstep(0.0, 2.2, max(db, 0.0))) * (1.0 - covB) * 0.7;
  vec4 basket = vec4(b * covB + vec3(0.92, 0.96, 1.0) * rim, covB + rim);
  return basket + col * (1.0 - basket.a);
}
`,
};

/**
 * The burner's flame in a box `H` tall and `W` to each side, its base at the bottom, additive:
 * a blue base, a white-hot core and orange tips, licking about with noise. `P` is `H`, `W` and
 * `burn` (0 to 1), how hard it fires.
 */
export const FLAME_SHADER: ShaderSource = {
  key: 'balloon/flame',
  glsl: `
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  float H = P.x;
  float W = P.y;
  float burn = P.z;
  float u = (H * 0.5 - p.y) / H;
  if (u < -0.05 || u > 1.1) return vec4(0.0);
  float ts = u_time * 0.001;
  float wprof = smoothstep(-0.02, 0.18, u) * pow(max(1.0 - u, 0.0), 0.8);
  float sway = (snoise(vec2(u * 2.3 - ts * 7.0, 3.1)) * 0.45 + snoise(vec2(u * 5.5 - ts * 15.0, 8.3)) * 0.18) * W * u;
  float edge = snoise(vec2(p.x * 0.45 / W, u * 4.0 - ts * 13.0)) * 0.22;
  float dx = abs(p.x - sway) / (W * wprof + 0.001) + edge * (0.3 + u);
  float flick = 0.5 + 0.5 * snoise(vec2(p.x * 0.2, ts * 18.0));
  float dens = (1.0 - smoothstep(0.35, 1.0, dx)) * (1.0 - smoothstep(0.6, 1.0, u + 0.2 * (flick - 0.5)));
  float core = 1.0 - smoothstep(0.0, 0.7, dx);
  vec3 col = vec3(1.0, 0.42, 0.06);
  col = mix(col, vec3(1.0, 0.8, 0.25), smoothstep(0.1, 0.55, core * (1.0 - u * 0.8)));
  col = mix(col, vec3(1.0, 0.97, 0.82), smoothstep(0.55, 0.9, core * (1.0 - u * 0.9)));
  col = mix(col, vec3(0.75, 0.1, 0.02), smoothstep(0.55, 1.0, u) * (1.0 - core));
  float blue = (1.0 - smoothstep(0.0, 0.35, u)) * (1.0 - smoothstep(0.0, 0.9, dx));
  col = mix(col, vec3(0.2, 0.4, 1.0), blue * 0.9);
  vec3 rgb = col * dens * (0.9 + 0.5 * core);
  rgb += vec3(0.2, 0.4, 1.0) * exp(-p.x * p.x / (W * W) - max(u, 0.0) * 9.0) * 0.45;
  rgb += vec3(1.0, 0.42, 0.06) * exp(-p.x * p.x / (W * W * 4.0) - max(u, 0.0) * 3.0) * 0.3;
  return vec4(rgb * burn, 0.0);
}
`,
};

/**
 * Additive, centred on the envelope: a warm bloom round it that follows the burner's `heat`, and
 * shimmering hot air rising from the throat inside. `P` is `R` and `heat`; `color` is the warmth.
 */
export const HAZE_SHADER: ShaderSource = {
  key: 'balloon/haze',
  glsl: `
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 warm) {
  float R = P.x;
  float heat = P.y;
  float t = u_time;
  vec2 q = p / R;
  float dist = length(vec2(q.x, (q.y - 0.15) * 0.8));
  float fade = 1.0 - smoothstep(1.1, 1.65, length(q - vec2(0.0, 0.1)));
  float halo = exp(-max(dist - 0.85, 0.0) * 2.8) * heat * 0.22 * fade;
  float h = 1.3 - q.y;
  float width = 0.14 + h * 0.22;
  float cone = (1.0 - smoothstep(0.5, 1.0, abs(q.x) / width)) * smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.5, 1.15, h));
  float shimmer = 0.5 + 0.5 * sin(h * R * 0.55 - t * 0.012 + snoise(vec2(q.x * 5.0, h * 3.0 - t * 0.002)) * 3.0);
  float plume = cone * (0.25 + 0.75 * shimmer) * heat * 0.22;
  return vec4(warm * (halo + plume), 0.0);
}
`,
};

/** What the balloon remover compiles at startup. */
export const BALLOON_SHADERS: readonly ShaderSource[] = [
  BASKET_SHADER,
  ENVELOPE_SHADER,
  FLAME_SHADER,
  HAZE_SHADER,
];

/** What is painted on the gores, in the order the shader numbers them. */
const PATTERNS = ['plain', 'bands', 'chevrons', 'stars'] as const;

/** The skirt's throat is this many radii below the envelope's middle. */
const THROAT = 1.4;
/** The ropes' length and the basket's height, as a share of the radius (for the 30 px balloon: 14 and 12). */
const ROPES = 14 / 30;
const BASKET = 12 / 30;

/** How a balloon looks and how hot it is. */
export interface BalloonLook {
  /** Up to four gore colours, taken in turn. */
  stripes: readonly Color[];
  skirt: Color;
  outline: Color;
  pattern?: (typeof PATTERNS)[number];
  /** How much the burner's light glows through the silk and blooms round it, 0 to 1. */
  heat?: number;
  /** How tall the flame stands, 0 to 1. */
  burn?: number;
}

function pack(color: Color): number {
  const [r, g, b] = parseColor(color);
  return Math.round(r * 255) * 65536 + Math.round(g * 255) * 256 + Math.round(b * 255);
}

/**
 * A hot-air balloon, its envelope `radius` px to each side and centred at (x, y); the skirt's
 * throat is `1.4 radius` under the middle, the basket's foot `2.27 radius`.
 */
export function drawBalloonShader(
  gfx: Gfx,
  x: number,
  y: number,
  radius: number,
  { stripes, skirt, outline, pattern = 'plain', heat = 0, burn = 0 }: BalloonLook,
): void {
  const colors = stripes.slice(0, 4).map(pack);
  const [s0 = 0, s1 = 0, s2 = 0, s3 = 0] = colors;
  const meta = Math.max(1, colors.length) + 8 * PATTERNS.indexOf(pattern);
  const envelope = radius * THROAT;
  // The ropes and basket first, so the skirt's throat covers their tops.
  const hang = radius * (ROPES + BASKET);
  gfx.shade(
    BASKET_SHADER,
    { x, y: y + envelope + hang / 2, halfW: radius * 0.5, halfH: hang / 2 + 3 },
    { p: [radius, heat] },
  );
  gfx.shade(
    ENVELOPE_SHADER,
    { x, y, halfW: radius + 4, halfH: envelope + 4 },
    { p: [radius, s0, s1, s2], q: [s3, pack(skirt), meta, heat], color: outline },
  );
  // The flame rises from the throat, with the heat over it all.
  const height = radius * (0.12 + 0.95 * burn);
  const half = radius * 0.17;
  gfx.shade(
    FLAME_SHADER,
    { x, y: y + envelope - radius * 0.05 - height / 2, halfW: half * 3 + 2, halfH: height / 2 + 4 },
    { p: [height, half, 0.3 + 0.7 * burn], blend: 'add' },
  );
  const bloom = radius * 1.7;
  gfx.shade(
    HAZE_SHADER,
    { x, y, halfW: bloom, halfH: bloom },
    { p: [radius, heat], color: '#fdba74', blend: 'add' },
  );
}
