// The flying saucer and its plasma beam, drawn entirely in GLSL. Chunks for the shapes
// shader (`shapes.ts`), after `noise.ts`: they need `snoise` and the `TAU` and `hue` the
// shader defines before them. Each takes its position in px from the shape's middle and
// returns a premultiplied colour.

/**
 * `vec4 saucerColor(...)`: the saucer in a unit box, `R` px to its rim, level: chrome hull,
 * glass dome with swirling energy and a small alien, a ring of chasing lights, a glowing
 * emitter underneath and a halo, with `px` the width of a device pixel and `t` in ms.
 */
export const SAUCER_GLSL = `
float sdEllipse(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k1 > 1e-6 ? k0 * (k0 - 1.0) / k1 : -min(r.x, r.y);
}

// The sky and ground a chrome surface mirrors: y is where the reflection points (negative is up).
vec3 chromeEnv(float y, float x, float t) {
  vec3 sky = mix(vec3(0.80, 0.90, 1.0), vec3(0.16, 0.30, 0.62), pow(clamp(-y * 1.15, 0.0, 1.0), 0.7));
  vec3 ground = mix(vec3(0.42, 0.34, 0.32), vec3(0.03, 0.04, 0.08), pow(clamp(y * 1.4, 0.0, 1.0), 0.6));
  vec3 env = mix(sky, ground, smoothstep(-0.05, 0.07, y));
  env += vec3(1.0, 0.93, 0.80) * exp(-pow((y + 0.03) / 0.06, 2.0)) * 0.95;
  // Soft boxes of light up in the sky, sliding past as the saucer sways.
  float panel = smoothstep(0.07, 0.02, abs(y + 0.42)) * smoothstep(0.30, 0.10, abs(x * 0.6 - 0.25 + 0.2 * sin(t * 0.0008)));
  env += vec3(1.0) * panel * 1.1;
  return env;
}

// Over: top above bottom, both premultiplied.
vec4 over(vec4 top, vec4 bottom) {
  return top + bottom * (1.0 - top.a);
}

vec4 saucerColor(vec2 p, float R, vec3 hullTint, vec3 domeCol, vec3 lightCol, float glow, float t, float px) {
  p /= R;
  float aa = px * 0.75 / R;
  const float TOP = 0.28;
  const float BOT = 0.24;

  // --- the hull: a lens, thicker on top, with the seam round its equator ---
  bool upper = p.y < 0.0;
  float dHull = sdEllipse(p, vec2(1.0, upper ? TOP : BOT));
  float covHull = 1.0 - smoothstep(-aa, aa, dHull);
  vec2 e = vec2(p.x, p.y / (upper ? TOP : BOT));
  float r2 = min(dot(e, e), 0.97);
  vec3 n = normalize(vec3(e.x * 0.85, e.y * 0.9, sqrt(1.0 - r2)));
  vec3 refl = vec3(2.0 * n.z * n.x, 2.0 * n.z * n.y, 2.0 * n.z * n.z - 1.0);
  vec3 chrome = chromeEnv(refl.y * 0.95 + 0.02, refl.x, t) * mix(vec3(1.0), hullTint, 0.5);
  // The underside is in shadow, and shadowed again under the dome's collar.
  chrome *= mix(1.0, 0.42, smoothstep(0.0, 0.9, e.y) * step(0.0, p.y));
  // A highlight that sweeps along the hull, stretched with its curve.
  float sweep = sin(t * 0.00065) * 0.8;
  float streak = exp(-pow((n.x - sweep) / 0.10, 2.0)) * smoothstep(0.05, 0.55, -n.y + 0.15) * (0.55 + 0.45 * n.z);
  chrome += vec3(1.0, 0.98, 0.92) * streak * 0.85;
  // Rim light where the hull turns away.
  float fres = pow(1.0 - n.z, 2.6);
  chrome += mix(domeCol, vec3(1.0), 0.55) * fres * 0.85 * (0.6 + 0.4 * glow);
  // The seam: a bright line on the equator over a dark groove.
  chrome *= 1.0 - 0.55 * smoothstep(0.03, 0.0, abs(p.y - 0.032)) * step(0.0, p.y);
  chrome += vec3(1.0, 0.97, 0.9) * exp(-pow(p.y / 0.011, 2.0)) * 1.1;
  // The emitter underneath: a ring of light round a hot lens.
  float dRing = sdEllipse(p - vec2(0.0, 0.115), vec2(0.5, 0.07));
  float dLens = sdEllipse(p - vec2(0.0, 0.165), vec2(0.21, 0.04));
  float pulse = 0.8 + 0.2 * sin(t * 0.006);
  float below = smoothstep(0.02, 0.07, p.y);
  chrome *= 1.0 - 0.5 * (1.0 - smoothstep(-0.02, 0.03, dRing)) * below;
  vec3 emit = lightCol * (exp(-pow(abs(dRing) / 0.014, 2.0)) * 1.2 + exp(-max(dRing, 0.0) * 18.0) * 0.12);
  emit += mix(lightCol, vec3(1.0), 0.7) * (smoothstep(0.012, -0.02, dLens) * 1.3 + exp(-max(dLens, 0.0) * 30.0) * 0.35);
  chrome += emit * pulse * below * glow;
  vec4 col = vec4(chrome * covHull, covHull);

  // --- the dome's collar, where it sits on the hull ---
  float dCollar = abs(sdEllipse(p - vec2(0.0, -0.25), vec2(0.52, 0.055))) - 0.008;
  float collar = (1.0 - smoothstep(-aa, aa, dCollar)) * smoothstep(-0.26, -0.22, p.y) * covHull;
  vec3 collarCol = mix(vec3(0.25, 0.28, 0.35), vec3(1.0), 0.55 + 0.45 * sin(p.x * 5.0 + 1.0)) * mix(vec3(1.0), hullTint, 0.5);
  col = over(vec4(collarCol * collar, collar), col);

  // --- the dome: glass over a swirl of energy ---
  vec2 dc = vec2(0.0, -0.25);
  vec2 dr = vec2(0.5, 0.55);
  float dDome = max(sdEllipse(p - dc, dr), p.y + 0.235);
  float covDome = 1.0 - smoothstep(-aa, aa, dDome);
  if (covDome > 0.001) {
    vec2 dp = (p - dc) / dr;
    float rr = min(dot(dp, dp), 0.99);
    vec3 nd = normalize(vec3(dp.x, dp.y, sqrt(1.0 - rr)));
    // Swirl: turn the plane further the nearer its middle, then warp it by noise.
    float turn = (1.2 - length(dp)) * 1.4 + t * 0.0007;
    vec2 sp = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * dp;
    vec2 w = vec2(snoise(sp * 1.0 + vec2(t * 0.00035, 0.0)), snoise(sp * 1.0 + vec2(5.2, -t * 0.0004)));
    float n1 = snoise(sp * 1.35 + w * 0.9 + vec2(0.0, -t * 0.0006));
    float cloud = 0.5 + 0.5 * n1;
    float fil = pow(1.0 - abs(n1), 4.0);
    vec3 deep = domeCol * 0.22 + vec3(0.0, 0.01, 0.03);
    vec3 inner = deep + domeCol * cloud * 0.9 + mix(domeCol, vec3(1.0), 0.65) * fil * 0.6;
    inner += domeCol * exp(-dot(dp, dp) * 2.6) * 0.5;
    inner *= 0.7 + 0.5 * glow;
    // A small alien at the controls, a darker shape with big slanted eyes.
    vec2 ap = dp - vec2(0.0, -0.27 + 0.015 * sin(t * 0.002));
    float head = sdEllipse(ap - vec2(0.0, 0.0), vec2(0.21, 0.26));
    float chin = sdEllipse(ap - vec2(0.0, 0.17), vec2(0.12, 0.14));
    float alien = 1.0 - smoothstep(-0.02, 0.02, min(head, chin));
    vec2 eyeP = vec2(abs(ap.x) - 0.1, ap.y + 0.02);
    float tilt = 0.5;
    eyeP = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * eyeP;
    float eye = 1.0 - smoothstep(-0.01, 0.01, sdEllipse(eyeP, vec2(0.08, 0.035)));
    inner = mix(inner, domeCol * 0.05, alien * 0.85);
    inner += mix(domeCol, vec3(1.0), 0.8) * eye * alien * 1.2;
    float glass = clamp(0.22 + 0.34 * cloud + 0.3 * fil, 0.0, 0.85);
    vec4 dome = vec4(inner * glass, glass);
    // The glass itself: a bright edge, a long streak of reflected light and a glint.
    float edge = pow(1.0 - nd.z, 2.2);
    vec3 glassLight = mix(domeCol, vec3(1.0), 0.6) * edge * 1.1;
    float band = dot(dp, normalize(vec2(1.0, 0.85)));
    float streakD = smoothstep(0.11, 0.0, abs(band + 0.52)) * smoothstep(0.92, 0.5, length(dp)) * 0.55;
    streakD += smoothstep(0.05, 0.0, abs(band + 0.70)) * smoothstep(0.92, 0.5, length(dp)) * 0.3;
    float glint = exp(-dot(dp - vec2(-0.38, -0.52), dp - vec2(-0.38, -0.52)) / 0.0025);
    dome += vec4(glassLight + vec3(streakD + glint), edge * 0.55 + streakD * 0.7);
    // Where the base meets the collar, it fades into the hull's shadow.
    dome *= 1.0 - 0.45 * smoothstep(-0.3, 0.02, dp.y);
    dome *= covDome;
    dome.a = min(dome.a, 1.0);
    col = over(dome, col);
  }

  // --- lights chasing round the rim, the ones on the far side hidden behind it ---
  vec3 lit = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float th = TAU * fi / 12.0 + t * 0.0011;
    float s = sin(th);
    float seen = smoothstep(-0.1, 0.35, s);
    vec2 lp = vec2(cos(th) * 0.86, 0.062 + 0.034 * s);
    float chase = pow(0.5 + 0.5 * sin(fi * 1.05 - t * 0.0065), 3.0);
    vec3 lc = mix(lightCol, hue(fract(fi / 12.0 + t * 0.00018)), 0.3);
    lc = mix(lc, vec3(1.0), 0.2 + 0.5 * chase);
    vec2 d = p - lp;
    float dd = dot(d, d);
    float core = smoothstep(0.05, 0.02, sqrt(dd));
    float halo = exp(-dd / 0.0055);
    lit += lc * seen * (core * (0.8 + 0.9 * chase) + halo * (0.22 + 0.75 * chase) * glow);
  }
  col += vec4(lit, 0.0);

  // --- the halo round it all: the lights' glow underneath, the dome's above ---
  float dAll = min(dHull, dDome);
  float out_ = exp(-max(dAll, 0.0) * 4.0);
  vec3 haloCol = mix(lightCol, domeCol, smoothstep(0.1, -0.35, p.y));
  float fade = 1.0 - smoothstep(0.75, 1.28, max(abs(p.x), abs(p.y)));
  col = over(col, vec4(haloCol * out_ * 0.3 * glow * fade, 0.0));
  return col;
}
`;

/**
 * `vec4 beamColor(...)`: a plasma beam from a belly `topHalf` px to each side, `length` px down
 * to `botHalf` to each side, over a pool of light at its foot; `p` is in px from the middle of
 * its length. Meant for additive blending.
 */
export const BEAM_GLSL = `
float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec4 beamColor(vec2 p, float topHalf, float botHalf, float len, float strength, vec3 col, float t) {
  float y = p.y + len * 0.5;
  float v = clamp(y / len, 0.0, 1.0);
  float hw = mix(topHalf, botHalf, v);
  float x = p.x / hw;
  // The edges ripple, faster than the bands in the middle climb.
  float ripple = snoise(vec2(y * 0.035 - t * 0.0035, 1.7 + t * 0.0004)) * 0.07
               + snoise(vec2(y * 0.13 + t * 0.007, 9.1)) * 0.03;
  float ax = abs(x) / (1.0 + ripple);
  float body = 1.0 - smoothstep(0.78, 1.0, ax);
  body *= smoothstep(len + 6.0, len - 14.0, y);
  body *= smoothstep(0.0, 5.0, y);
  float alongFade = mix(1.0, 0.55, v);
  // Streaks of plasma and bands of energy, all climbing towards the saucer.
  float streak = snoise(vec2(x * 2.4 + 3.0, y * 0.028 + t * 0.0048));
  float bands = 0.5 + 0.5 * sin(y * 0.15 + t * 0.0095 + streak * 2.2);
  bands = pow(bands, 3.0);
  float plasma = 0.28 + 0.3 * (0.5 + 0.5 * streak) + 0.55 * bands;
  float core = exp(-x * x * 5.5);
  float sheath = smoothstep(0.55, 0.95, ax) * body;
  vec3 hot = mix(col, vec3(1.0), 0.8);
  vec3 rgb = col * plasma * body * 0.85;
  rgb += hot * core * body * (0.18 + 0.45 * bands);
  rgb += mix(col, hot, 0.5) * sheath * (0.45 + 0.4 * streak);
  rgb *= alongFade;
  // Sparkles drifting up through it.
  vec2 uv = vec2(p.x / 8.0, y / 8.0 + t * 0.0055);
  vec2 cell = floor(uv);
  vec2 f = fract(uv) - 0.5 - (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.5;
  float rnd = hash12(cell);
  float spark = step(0.9, rnd) * smoothstep(0.2, 0.0, length(f)) * (0.5 + 0.5 * sin(t * 0.02 + rnd * 40.0));
  rgb += hot * spark * 1.4 * step(ax, 0.85) * body;
  // The pool of light where it meets the pile.
  vec2 pool = vec2(p.x, y - len) / vec2(botHalf * 1.15, botHalf * 0.22);
  float pd = length(pool);
  float poolA = (1.0 - smoothstep(0.0, 1.0, pd)) * (0.35 + 0.25 * snoise(vec2(p.x * 0.06 + t * 0.002, y * 0.1)));
  rgb += mix(col, vec3(1.0), 0.4) * poolA * step(0.0, y - len * 0.9);
  return vec4(rgb * strength, 0.0);
}
`;
