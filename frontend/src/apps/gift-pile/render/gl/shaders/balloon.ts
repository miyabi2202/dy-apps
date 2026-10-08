// The hot-air balloon, drawn entirely in GLSL: a silk envelope of gore panels with patterns,
// the burner's light glowing through it, a woven wicker basket on its ropes, a noise-driven
// flame and the heat above it. Chunks for the shapes shader (`shapes.ts`), after `noise.ts`:
// they need `snoise` and the `TAU` the shader defines before them. Each takes its position in
// px from the shape's middle, `px` the width of a device pixel and `t` in ms, and returns a
// premultiplied colour. All the sizes follow the envelope's radius `R`, as the 30 px balloon
// they were drawn for.

/**
 * `vec4 balloonEnvelopeColor(...)`: the envelope and its skirt, `R` px to its sides, centred on
 * the envelope's middle: the skirt's throat is `1.4 R` below. `s03` are the gores' first three
 * colours and `s3` the fourth, packed as `r * 65536 + g * 256 + b` (0 to 255 each), taken in
 * turn; `meta` is the number of them plus 8 times the pattern (0 plain, 1 bands, 2 chevrons,
 * 3 stars); `heat` (0 to 1) is how much the burner lights it from inside.
 */
export const BALLOON_ENVELOPE_GLSL = `
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

vec4 balloonEnvelopeColor(vec2 p, float R, vec3 s03, float s3, float skirtP, float meta, float heat, vec3 outlineCol, float t, float px) {
  vec2 q = p / R;
  float y = q.y;
  float w = balHalf(y);
  float wp = clamp((balHalf(y + 0.01) - balHalf(y - 0.01)) / 0.02, -8.0, 8.0);
  float d = max((abs(q.x) - w) / sqrt(1.0 + wp * wp) * R, (y - 1.4) * R);
  if (y < 0.5) d = (length(q) - 1.0) * R;
  if (d > 3.0) return vec4(0.0);
  float aa = max(px * 0.75, 1e-3);
  float cov = 1.0 - smoothstep(-aa, aa, d);
  float aq = px / R;

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
    float star = 1.0 - smoothstep(-aa, aa, balStar(sp, min(gorePx * 0.42, 0.17 * R)));
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
`;

/**
 * `vec4 balloonBasketColor(...)`: the ropes and the woven basket, centred half way down them,
 * from the throat (`14/30 R` plus the basket's height `12/30 R` of them) to the basket's foot.
 */
export const BALLOON_BASKET_GLSL = `
float balSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float balRound(vec2 p, vec2 half_, float r) {
  vec2 q = abs(p) - half_ + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec4 balloonBasketColor(vec2 p, float R, float heat, float t, float px) {
  float u = R / 30.0;
  float L = 14.0 * u;
  float B = 12.0 * u;
  float hw = 10.0 * u;
  float top = -(L + B) * 0.5;
  float bt = top + L;
  float aa = max(px * 0.75, 1e-3);

  // The ropes down from the throat to the basket's corners, and two lighter between.
  float dr = min(balSegment(p, vec2(-6.0 * u, top), vec2(-(hw - 2.0 * u), bt + 1.0)),
                 balSegment(p, vec2(6.0 * u, top), vec2(hw - 2.0 * u, bt + 1.0)));
  dr = min(dr, min(balSegment(p, vec2(-2.5 * u, top), vec2(-hw * 0.42, bt)),
                   balSegment(p, vec2(2.5 * u, top), vec2(hw * 0.42, bt))));
  float covR = (1.0 - smoothstep(0.4, 0.4 + aa * 1.5, dr)) * 0.9;
  vec3 ropeCol = vec3(0.93, 0.87, 0.72) * (0.8 + 0.2 * sin(p.y * 2.2 + p.x * 1.3));
  vec4 col = vec4(ropeCol * covR, covR);

  // The basket, a little wider at the top.
  float taper = 1.0 - 0.07 * clamp((p.y - bt) / B, 0.0, 1.0);
  float db = balRound(p - vec2(0.0, bt + B * 0.5), vec2(hw * taper, B * 0.5), 3.0 * u);
  float covB = 1.0 - smoothstep(-aa, aa, db);
  vec2 bp = vec2(p.x, p.y - bt);
  float nxs = clamp(p.x / (hw * taper), -1.0, 1.0);
  // Strands of cane woven over and under.
  float row = bp.y / (2.4 * u);
  float ri = floor(row);
  float cell = bp.x / (3.2 * u) + 0.5 * mod(ri, 2.0);
  float over = mod(floor(cell) + ri, 2.0);
  float weave = (0.45 + 0.55 * sin(fract(row) * 3.14159)) * (0.8 + 0.2 * sin(fract(cell) * TAU)) * mix(0.85, 1.05, over);
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
`;

/**
 * `vec4 balloonFlameColor(...)`: the burner's flame in a box `H` tall and `W` to each side, its
 * base at the bottom, additive: a blue base, a white-hot core and orange tips, licking about
 * with noise. `burn` (0 to 1) is how hard it fires.
 */
export const BALLOON_FLAME_GLSL = `
vec4 balloonFlameColor(vec2 p, float H, float W, float burn, float t) {
  float u = (H * 0.5 - p.y) / H;
  if (u < -0.05 || u > 1.1) return vec4(0.0);
  float ts = t * 0.001;
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
`;

/**
 * `vec4 balloonHazeColor(...)`: additive, centred on the envelope: a warm bloom round it that
 * follows the burner's `heat`, and shimmering hot air rising from the throat inside.
 */
export const BALLOON_HAZE_GLSL = `
vec4 balloonHazeColor(vec2 p, float R, float heat, vec3 warm, float t) {
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
`;
