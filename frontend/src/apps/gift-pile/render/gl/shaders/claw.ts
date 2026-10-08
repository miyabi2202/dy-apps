// The claw machine, drawn entirely in GLSL. Chunks for the shapes shader (`shapes.ts`),
// after `noise.ts`: they need `snoise` and the `TAU` and `hue` the shader defines before
// them. Every function but the entry points is `claw`-prefixed so the chunks of other
// removers never clash with it. Each entry point takes its position in design px (the
// shape's own units, `local / s`) and returns a premultiplied colour; the light that only
// adds (glows, arcs) has alpha 0.

/** Helpers shared by every part below: hashes, a chrome environment, a tapered segment. */
export const CLAW_COMMON_GLSL = `
const float CLAW_PI = 3.14159265;

float clawHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Over: top above bottom, both premultiplied.
vec4 clawOver(vec4 top, vec4 bottom) {
  return top + bottom * (1.0 - top.a);
}

// The arcade a chrome surface mirrors: y is where the reflection points (negative is up).
// A bright soft box above, a dark room with a neon strip at the horizon, a dim floor.
vec3 clawEnv(float y, float x, vec3 neon, float t) {
  vec3 top = mix(vec3(0.95, 0.97, 1.0), vec3(0.22, 0.28, 0.46), clamp(-y * 1.1 - 0.15, 0.0, 1.0));
  vec3 floorCol = mix(vec3(0.46, 0.44, 0.5) + neon * 0.3, vec3(0.08, 0.1, 0.18) + neon * 0.1, clamp(y * 1.2, 0.0, 1.0));
  vec3 env = mix(top, floorCol, smoothstep(-0.08, 0.1, y));
  // The horizon: a thin bright strip, tinted by the neon.
  env += mix(vec3(1.0, 0.95, 0.85), neon, 0.4) * exp(-pow((y - 0.0) / 0.045, 2.0)) * 1.15;
  // Two soft boxes sliding by as the light moves.
  float box = smoothstep(0.09, 0.03, abs(y + 0.5)) * smoothstep(0.55, 0.15, abs(x * 0.7 - 0.3 + 0.35 * sin(t * 0.0006)));
  env += vec3(1.0) * box * 1.25;
  return env;
}

// Distance to a tapered segment a (radius ra) to b (rb): negative inside. h runs 0 to 1 along it,
// across from -1 to 1 over its width, and dir is its direction.
float clawSeg(vec2 p, vec2 a, vec2 b, float ra, float rb, out float h, out float across, out vec2 dir) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float L2 = dot(ba, ba);
  h = clamp(dot(pa, ba) / L2, 0.0, 1.0);
  dir = ba * inversesqrt(L2);
  float r = mix(ra, rb, h);
  across = clamp((pa.x * -dir.y + pa.y * dir.x) / max(r, 0.01), -1.0, 1.0);
  return length(pa - ba * h) - r;
}

// Brushed chrome on a cylinder: across is -1 to 1 over its width, perp its 2D normal at +1, along
// its length in px. Anisotropic streaks along it, a sweeping highlight and a coloured fresnel rim.
vec3 clawMetal(float across, vec2 perp, float along, vec3 tint, vec3 neon, float t, float seed) {
  float nz = sqrt(max(1.0 - across * across, 0.0));
  vec2 n2 = perp * across;
  vec2 refl = 2.0 * nz * n2;
  float brush = snoise(vec2(across * 7.0 + seed, along * 0.22 + seed * 3.0));
  float fine = snoise(vec2(across * 23.0 - seed, along * 0.05));
  vec3 col = clawEnv(refl.y * 0.95 + 0.04 + brush * 0.07, refl.x, neon, t) * mix(vec3(1.0), tint, 0.4);
  col *= 0.93 + 0.07 * fine;
  float sweep = fract(t * 0.00048 + along * 0.017 + seed * 0.37);
  float glint = smoothstep(0.09, 0.0, abs(sweep - 0.5)) * smoothstep(1.0, 0.1, abs(across - 0.25 * sin(t * 0.0008 + seed)));
  col += vec3(1.0, 0.98, 0.92) * glint * 0.9;
  col += neon * pow(1.0 - nz, 2.4) * 0.9;
  return col;
}

// A glossy lacquer over a base colour: a vertical shade, a clearcoat band at the top and a rim.
vec3 clawLacquer(vec3 base, float v, vec3 neon, float t) {
  vec3 col = base * (0.45 + 0.75 * smoothstep(1.0, -0.6, v));
  col *= mix(0.55, 1.0, smoothstep(1.0, 0.0, v));
  float coat = smoothstep(0.35, -0.55, v) * smoothstep(-1.0, -0.5, v);
  col += vec3(1.0) * coat * 0.5;
  col += neon * pow(smoothstep(0.35, 1.0, v), 2.0) * 0.45;
  return col;
}

// A jagged bolt from a to b, as a glow: x the white-hot core, y the halo.
vec2 clawBolt(vec2 p, vec2 a, vec2 b, float seed, float frame) {
  vec2 ba = b - a;
  float L = max(length(ba), 0.001);
  vec2 dir = ba / L;
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 q = p - a;
  float along = dot(q, dir);
  float u = clamp(along / L, 0.0, 1.0);
  float off = (snoise(vec2(u * 5.0 + seed, frame * 1.7 + seed)) * 0.75
    + snoise(vec2(u * 13.0 + seed * 2.0, frame * 3.1)) * 0.25) * L * 0.34 * sin(CLAW_PI * u);
  float d = abs(dot(q, nrm) - off);
  float ends = smoothstep(-1.0, 0.5, along) * smoothstep(L + 1.0, L - 1.5, along);
  float core = exp(-d * d / 0.45) * ends;
  float halo = exp(-d / 2.4) * ends * (0.5 + 0.5 * u);
  return vec2(core, halo);
}
`;

/**
 * `vec4 clawHeadColor(...)`: the claw's head: a glossy hub with a glowing core and a ring of LEDs,
 * a short cap on top, and three articulated chrome prongs, `open` from 0 (shut) to 1, with an
 * electric arc over the tips while it grips (`arc` 0 to 1). `p` is in px from the hub's middle,
 * y down, as the old drawing had it.
 */
export const CLAW_HEAD_GLSL = `
vec4 clawPronged(vec2 p, vec2 a, vec2 knee, vec2 tip, float rUp, float rLow, vec3 tint, vec3 neon, float t, float seed, float aa) {
  float h, across;
  vec2 dir;
  vec4 col = vec4(0.0);
  // The lower segment first, then the upper over it, then the knee.
  float d2 = clawSeg(p, knee, tip, rUp * 0.95, rLow, h, across, dir);
  float cov2 = 1.0 - smoothstep(-aa, aa, d2);
  vec3 c2 = clawMetal(across, vec2(-dir.y, dir.x), h * length(tip - knee), tint, neon, t, seed + 1.3);
  // The tip: a bright polished pad.
  c2 += vec3(1.0) * smoothstep(0.75, 1.0, h) * 0.35;
  col = clawOver(vec4(c2 * cov2, cov2), col);
  float d1 = clawSeg(p, a, knee, rUp, rUp * 0.95, h, across, dir);
  float cov1 = 1.0 - smoothstep(-aa, aa, d1);
  vec3 c1 = clawMetal(across, vec2(-dir.y, dir.x), h * length(knee - a), tint, neon, t, seed);
  col = clawOver(vec4(c1 * cov1, cov1), col);
  // The knee: a polished ball with a bolt.
  vec2 kp = p - knee;
  float dk = length(kp) - rUp * 1.3;
  float covK = 1.0 - smoothstep(-aa, aa, dk);
  vec2 kn = kp / (rUp * 1.3);
  float knz = sqrt(max(1.0 - dot(kn, kn), 0.0));
  vec3 ck = clawEnv(2.0 * knz * kn.y * 0.9, 2.0 * knz * kn.x, neon, t) * mix(vec3(1.0), tint, 0.4);
  ck += neon * pow(1.0 - knz, 2.0) * 0.8;
  ck += vec3(1.0) * exp(-dot(kn - vec2(-0.35, -0.4), kn - vec2(-0.35, -0.4)) / 0.04) * 0.9;
  col = clawOver(vec4(ck * covK, covK), col);
  return col;
}

vec4 clawHeadColor(vec2 p, vec3 body, vec3 metal, float open, float arc, float glow, float t, float px) {
  float aa = px * 0.75;
  vec3 neon = mix(body, vec3(1.0), 0.25);
  vec4 col = vec4(0.0);

  // --- the prongs: the middle one behind, then the two at the sides ---
  for (int k = 0; k < 3; k++) {
    float side = k == 0 ? 0.0 : (k == 1 ? -1.0 : 1.0);
    float spread = side == 0.0 ? 0.0 : side * (0.18 + 0.6 * open);
    float upper = side == 0.0 ? 13.0 : 16.0;
    vec2 knee = vec2(sin(spread) * upper, 4.0 + cos(spread) * upper);
    vec2 tip = vec2(knee.x - side * (5.0 + 4.0 * (1.0 - open)), knee.y + 11.0);
    float r = side == 0.0 ? 1.8 : 2.4;
    vec4 prong = clawPronged(p, vec2(0.0, 4.0), knee, tip, r, r * 0.55, mix(metal, vec3(1.0), 0.3), neon, t, float(k) * 2.7, aa);
    // The middle prong is further back, so darker.
    if (k == 0) prong.rgb *= 0.72;
    col = clawOver(prong, col);
  }

  // --- the cap the cable ties to ---
  {
    vec2 q = abs(p - vec2(0.0, -8.4)) - vec2(2.6, 1.6) + 1.0;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 1.0;
    float cov = 1.0 - smoothstep(-aa, aa, d);
    float across = clamp((p.x) / 3.4, -1.0, 1.0);
    vec3 c = clawMetal(across, vec2(1.0, 0.0), p.y * 2.0, metal, neon, t, 4.1);
    col = clawOver(vec4(c * cov, cov), col);
  }

  // --- the hub: lacquered body in a chrome bezel ---
  vec2 hc = p - vec2(0.0, -0.5);
  vec2 hq = abs(hc) - vec2(14.0, 6.5) + 5.0;
  float dHub = length(max(hq, 0.0)) + min(max(hq.x, hq.y), 0.0) - 5.0;
  float covHub = 1.0 - smoothstep(-aa, aa, dHub);
  float bezel = smoothstep(-1.5, -0.6, dHub);
  vec3 lacquer = clawLacquer(body, hc.y / 6.5, neon, t);
  // A smoked groove round the bezel, then the chrome edge.
  vec3 chrome = clawEnv(hc.y / 6.5 * 0.9 + 0.1, hc.x / 14.0, neon, t) * mix(vec3(1.0), metal, 0.5);
  chrome += vec3(1.0) * smoothstep(0.6, 0.0, abs(hc.x / 14.0 + 0.55 - 0.2 * sin(t * 0.0009))) * 0.35;
  vec3 hubCol = mix(lacquer, chrome, bezel);
  // The core socket, a dark glass bowl with a chrome lip.
  float rc = length(hc * vec2(1.0, 1.55));
  float lip = smoothstep(0.7, 0.0, abs(rc - 5.0));
  hubCol = mix(hubCol, vec3(0.03, 0.03, 0.06), smoothstep(5.0, 4.4, rc));
  hubCol += clawEnv(hc.y * 0.2 - 0.1, hc.x * 0.1, neon, t) * lip * 0.7;
  col = clawOver(vec4(hubCol * covHub, covHub), col);
  // The core: a hot light that shifts between the body's colour and white, pulsing.
  float pulse = 0.75 + 0.25 * sin(t * 0.006) + 0.25 * (glow - 1.0);
  vec3 coreCol = mix(body, hue(fract(t * 0.00025)), 0.28) * 1.5;
  float dr = length(hc * vec2(1.0, 1.4));
  vec3 core = mix(coreCol, vec3(1.0), smoothstep(2.6, 0.0, dr)) * smoothstep(4.6, 1.2, dr) * (1.3 + 0.8 * glow) * pulse;
  core += coreCol * exp(-dr * dr / 18.0) * 0.55 * glow;
  col += vec4(core * smoothstep(0.0, 1.0, covHub + 0.001), 0.0);
  // The LED ring on the bezel's flat, chasing round it.
  vec3 lit = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float th = TAU * fi / 10.0;
    vec2 lp = vec2(cos(th) * 10.2, -0.5 + sin(th) * 3.6);
    float chase = pow(0.5 + 0.5 * sin(fi * 0.63 * 2.0 - t * 0.011 * (0.6 + 0.4 * glow)), 3.0);
    vec3 lc = mix(neon, hue(fract(fi / 10.0 + t * 0.0003)), 0.55);
    lc = mix(lc, vec3(1.0), 0.25 * chase);
    vec2 d = p - lp;
    float dd = dot(d, d);
    lit += lc * (smoothstep(1.3, 0.4, sqrt(dd)) * (0.8 + 1.1 * chase) + exp(-dd / 3.2) * (0.2 + 0.65 * chase) * glow);
  }
  col += vec4(lit * covHub, 0.0);

  // --- the arc: bolts from where the tips meet ---
  if (arc > 0.01) {
    float frame = floor(t / 55.0);
    vec2 tipC = vec2(0.0, 28.0);
    vec3 boltCol = mix(neon, vec3(0.75, 0.9, 1.0), 0.55);
    vec3 arcLight = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float r1 = clawHash(vec2(fi, frame));
      float r2 = clawHash(vec2(frame, fi + 9.0));
      float on = step(0.22, r1);
      // Mostly out to the sides and up, to the prongs' knees and past.
      float ang = -CLAW_PI * (0.1 + 0.8 * r2);
      float len = 8.0 + 11.0 * clawHash(vec2(fi * 3.0, frame + 5.0));
      vec2 end = tipC + vec2(cos(ang), sin(ang) * 0.9) * len * (fi == 0.0 ? 1.1 : 1.0);
      vec2 b = clawBolt(p, tipC + vec2((r1 - 0.5) * 3.0, 0.0), end, fi * 3.7, frame);
      arcLight += (vec3(1.0) * b.x * 1.6 + boltCol * (b.x * 0.6 + b.y * 0.55)) * on;
    }
    // A flash where they strike.
    float flash = exp(-dot(p - tipC, p - tipC) / 14.0) * (0.5 + 0.5 * clawHash(vec2(frame, 1.0)));
    arcLight += mix(boltCol, vec3(1.0), 0.6) * flash * 1.2;
    col += vec4(arcLight * arc, 0.0);
  }

  // --- the hub's halo ---
  float hd = length(hc * vec2(0.8, 1.1));
  col += vec4(neon * exp(-hd * 0.22) * 0.12 * glow, 0.0);
  return col;
}
`;

/**
 * `vec4 clawRailColor(...)`: the gantry rail along a view `halfW` px to each side of its middle
 * (`p` from there, y 0 on the rail's centre line), with LEDs chasing along a steel channel, neon
 * underglow, a bracket at each end, and the glossy carriage at `cx`.
 */
export const CLAW_RAIL_GLSL = `
vec4 clawRailColor(vec2 p, float halfW, float cx, vec3 body, vec3 railCol, float t, float px) {
  float aa = px * 0.75;
  vec3 neon = mix(body, vec3(1.0), 0.2);
  vec4 col = vec4(0.0);
  float x = p.x + halfW;

  // --- the steel channel, with a dark bore for the lights ---
  float dBar = abs(p.y) - 3.4;
  float covBar = 1.0 - smoothstep(-aa, aa, dBar);
  float across = clamp(p.y / 3.4, -1.0, 1.0);
  vec3 steel = clawMetal(across, vec2(0.0, 1.0), x, mix(railCol, vec3(1.0), 0.55), neon, t, 7.7);
  steel = mix(steel, railCol * 0.5 + vec3(0.04), 0.35);
  float bore = smoothstep(1.35, 0.9, abs(p.y - 0.3));
  steel = mix(steel, vec3(0.02, 0.02, 0.04), bore * 0.92);
  col = clawOver(vec4(steel * covBar, covBar), col);

  // --- the LEDs: round ones every 8 px, RGB chasing along ---
  float cell = floor(x / 8.0);
  vec2 lp = vec2(fract(x / 8.0) * 8.0 - 4.0, p.y - 0.3);
  float dd = dot(lp, lp);
  float chase = pow(0.5 + 0.5 * sin(cell * 0.55 - t * 0.0095), 3.0);
  float chase2 = 0.5 + 0.5 * sin(cell * 0.18 + t * 0.003);
  vec3 lc = mix(body, hue(fract(cell * 0.011 - t * 0.0004)), 0.65);
  lc = mix(lc, vec3(1.0), 0.3 * chase);
  float led = smoothstep(1.25, 0.5, sqrt(dd)) * (0.35 + 0.95 * chase + 0.2 * chase2);
  col += vec4(lc * led * covBar, 0.0);
  col += vec4(lc * exp(-dd / 4.0) * (0.18 + 0.45 * chase) * covBar, 0.0);

  // --- the underglow: neon spilling off the channel, rippling slowly ---
  vec3 glowCol = mix(body, hue(fract(x * 0.0035 - t * 0.0002)), 0.4);
  float below = exp(-max(p.y - 3.0, 0.0) / 6.5) * smoothstep(-3.0, 3.0, p.y);
  float above = exp(-max(-p.y - 3.0, 0.0) / 3.0) * 0.4 * smoothstep(3.0, -3.0, p.y);
  float shimmer = 0.85 + 0.15 * sin(x * 0.09 - t * 0.004);
  col += vec4(glowCol * (below * 0.34 + above * 0.2) * shimmer, 0.0);

  // --- the end brackets, one at each side of the view ---
  float edge = halfW - abs(p.x);
  float bracket = smoothstep(7.0, 5.0, edge) * (1.0 - smoothstep(-aa, aa, abs(p.y) - 6.2));
  vec3 bc = clawMetal(clamp(p.y / 6.2, -1.0, 1.0), vec2(0.0, 1.0), p.y, mix(railCol, vec3(1.0), 0.5), neon, t, 2.2);
  col = clawOver(vec4(bc * bracket * 0.9, bracket), col);
  col += vec4(neon * exp(-edge * edge / 60.0) * exp(-p.y * p.y / 90.0) * 0.8, 0.0);

  // --- the carriage: lacquered, with a smoked window of status bars and a lamp underneath ---
  vec2 cp = vec2(p.x - cx, p.y);
  vec2 cq = abs(cp) - vec2(19.0, 7.2) + 5.0;
  float dCar = length(max(cq, 0.0)) + min(max(cq.x, cq.y), 0.0) - 5.0;
  float covCar = 1.0 - smoothstep(-aa, aa, dCar);
  if (covCar > 0.001 || dCar < 16.0) {
    // The carriage's own shadow on the channel, and the neon spilling from it.
    float spill = exp(-max(dCar, 0.0) * 0.28) * (1.0 - covCar);
    col += vec4(neon * spill * 0.16, 0.0);
    float bez = smoothstep(-1.7, -0.7, dCar);
    vec3 lac = clawLacquer(body, cp.y / 7.2, neon, t);
    vec3 chrome = clawEnv(cp.y / 7.2 * 0.9 + 0.08, cp.x / 19.0, neon, t) * mix(vec3(1.0), railCol, 0.2);
    chrome += vec3(1.0) * smoothstep(0.5, 0.0, abs(cp.x / 19.0 + 0.7 - 1.4 * fract(t * 0.0003))) * 0.25;
    vec3 car = mix(lac, chrome, bez);
    // Smoked window with bars of light that flicker like a score.
    vec2 wq = abs(cp - vec2(0.0, -0.4)) - vec2(10.5, 2.4) + 1.2;
    float dWin = length(max(wq, 0.0)) + min(max(wq.x, wq.y), 0.0) - 1.2;
    float win = 1.0 - smoothstep(-aa, aa, dWin);
    car = mix(car, vec3(0.02, 0.025, 0.05) + neon * 0.05, win * 0.93);
    float barI = floor((cp.x + 9.0) / 3.0);
    float lev = 0.25 + 0.75 * (0.5 + 0.5 * sin(barI * 1.9 + t * 0.006 + barI * barI * 0.3));
    float inBar = step(abs(fract((cp.x + 9.0) / 3.0) - 0.5), 0.3) * step(0.0, barI) * step(barI, 5.0);
    float barH = smoothstep(0.0, -aa, abs(cp.y + 0.4) - 1.6 * lev);
    col = clawOver(vec4(car * covCar, covCar), col);
    col += vec4(mix(neon, vec3(1.0), 0.4) * inBar * barH * win * 1.3, 0.0);
    // A lamp under the middle, throwing light down.
    vec2 lampP = cp - vec2(0.0, 6.6);
    float lamp = smoothstep(2.0, 0.8, length(lampP * vec2(0.7, 1.4))) * covCar;
    col += vec4(vec3(1.0, 0.95, 0.8) * lamp * 1.2, 0.0);
    col += vec4(neon * exp(-dot(lampP, lampP) / 28.0) * 0.5, 0.0);
    // Light catching its top edge.
    col += vec4(vec3(1.0) * smoothstep(0.7, 0.0, abs(cp.y + 5.6)) * smoothstep(13.0, 4.0, abs(cp.x)) * covCar * 0.25, 0.0);
  }
  return col;
}
`;

/**
 * `vec4 clawChainColor(...)`: a chrome chain `len` px long, links alternating face on and edge on,
 * with a glint travelling down it; `p` is in px from its middle, x along it.
 */
export const CLAW_CHAIN_GLSL = `
vec4 clawChainColor(vec2 p, float len, vec3 tint, vec3 neon, float t, float px) {
  float aa = px * 0.75;
  float y = p.x + len * 0.5;
  const float PITCH = 3.4;
  const float R = 1.7;
  float cell = floor(y / PITCH + 0.5);
  vec2 q = vec2(y - cell * PITCH, p.y);
  // A thin wire between the beads, then each bead a polished ball.
  float dWire = max(abs(q.y) - 0.45, 0.0) + max(abs(q.x) - PITCH * 0.5, 0.0);
  float covWire = 1.0 - smoothstep(-aa, aa, dWire - 0.0);
  float wireShade = 0.35 + 0.5 * smoothstep(0.45, -0.45, q.y);
  vec4 col = vec4(tint * wireShade * covWire, covWire);
  float d = length(q) - R;
  float cov = 1.0 - smoothstep(-aa, aa, d);
  vec2 n2 = q / R;
  float nz = sqrt(max(1.0 - dot(n2, n2), 0.0));
  // Each bead mirrors the room a little differently, so the chain sparkles as it swings.
  vec3 c = clawEnv(2.0 * nz * n2.x * 0.9 + 0.02 * sin(cell), 2.0 * nz * n2.y, neon, t) * mix(vec3(1.0), tint, 0.4);
  c += neon * pow(1.0 - nz, 2.0) * 0.8;
  c += vec3(1.0) * exp(-dot(n2 - vec2(-0.1, -0.45), n2 - vec2(-0.1, -0.45)) / 0.05) * 0.9;
  // A glint running down the chain.
  float run = fract(t * 0.0008 - y / 90.0);
  c += vec3(1.0) * smoothstep(0.07, 0.0, abs(run - 0.5)) * 0.9;
  col = clawOver(vec4(c * cov, cov), col);
  col += vec4(neon * exp(-p.y * p.y / 4.0) * 0.12, 0.0);
  return col;
}
`;

/**
 * `vec4 clawSpotColor(...)`: a soft cone of light `topHalf` px to each side at its top and
 * `botHalf` at `len` px down, streaked by drifting haze with dust motes floating through it;
 * `p` is in px from its middle, x along it. Additive.
 */
export const CLAW_SPOT_GLSL = `
vec4 clawSpotColor(vec2 p, float topHalf, float botHalf, float len, float strength, vec3 col, float t) {
  float y = p.x + len * 0.5;
  float v = clamp(y / len, 0.0, 1.0);
  float hw = mix(topHalf, botHalf, v);
  float x = p.y / hw;
  float ax = abs(x);
  float body = smoothstep(1.0, 0.35, ax) * smoothstep(-2.0, 6.0, y) * smoothstep(len + 8.0, len - 20.0, y);
  float haze = 0.6 + 0.4 * snoise(vec2(x * 2.3 + 4.0, y * 0.02 - t * 0.0004));
  float shaft = 0.5 + 0.5 * snoise(vec2(x * 5.5, t * 0.0003));
  float fall = mix(1.0, 0.45, v);
  vec3 rgb = mix(col, vec3(1.0), 0.65) * body * fall * (0.55 * haze + 0.25 * shaft) * 0.5;
  // Dust motes drifting down it, twinkling as they cross the light.
  vec2 uv = vec2(p.y / 7.0, y / 7.0 - t * 0.0014);
  vec2 cell = floor(uv);
  float rnd = clawHash(cell + 3.3);
  vec2 jitter = (vec2(clawHash(cell + 1.1), clawHash(cell + 8.8)) - 0.5) * 0.6;
  vec2 f = fract(uv) - 0.5 - jitter;
  float mote = step(0.78, rnd) * smoothstep(0.17, 0.0, length(f)) * (0.35 + 0.65 * sin(t * 0.004 + rnd * 40.0) * sin(t * 0.004 + rnd * 40.0));
  rgb += vec3(1.0, 0.98, 0.9) * mote * body * 1.4;
  return vec4(rgb * strength, 0.0);
}
`;

/**
 * `vec4 clawAuraColor(...)`: the glow round a grabbed prize, `R` px to its rim: a breathing halo,
 * a ring of living energy at the rim and sparkles orbiting it. Additive.
 */
export const CLAW_AURA_GLSL = `
vec4 clawAuraColor(vec2 p, float R, float strength, vec3 col, float t) {
  float r = length(p) / R;
  float ang = atan(p.y, p.x);
  vec3 hot = mix(col, vec3(1.0), 0.6);
  float breath = 0.85 + 0.15 * sin(t * 0.005);
  float inside = smoothstep(1.3, 0.95, r);
  vec3 rgb = col * exp(-r * r * 1.5) * 0.55 * breath * inside;
  // The rim: a bright ring, rippling with noise that turns.
  float wob = snoise(vec2(cos(ang + t * 0.0012) * 1.6 + 3.0, sin(ang + t * 0.0012) * 1.6 + t * 0.0007));
  float rim = exp(-pow((r - 1.0 - 0.06 * wob) / 0.09, 2.0));
  rgb += mix(col, hot, 0.5) * rim * (0.55 + 0.35 * wob) * breath;
  rgb += col * exp(-max(r - 1.0, 0.0) * 2.6) * smoothstep(0.7, 1.0, r) * 0.35 * inside;
  // Sparkles in orbit.
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float th = TAU * fi / 7.0 + t * (0.0016 + 0.0004 * fi);
    float rr = (1.08 + 0.1 * sin(t * 0.003 + fi * 2.0)) * R;
    vec2 d = p - vec2(cos(th), sin(th)) * rr;
    float tw = 0.5 + 0.5 * sin(t * 0.012 + fi * 3.1);
    rgb += hot * (smoothstep(2.2, 0.3, length(d)) * 1.2 + exp(-dot(d, d) / 14.0) * 0.4) * (0.4 + 0.6 * tw);
  }
  return vec4(rgb * strength, 0.0);
}
`;
