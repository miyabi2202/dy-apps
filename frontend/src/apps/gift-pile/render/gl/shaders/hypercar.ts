// The hypercar, drawn entirely in GLSL: a chunk for the shapes shader (`shapes.ts`), after
// `noise.ts` and `ufo.ts` (it uses `snoise`, `hash12`, `over` and `sdEllipse`). Everything is
// worked out in the car's own frame, in px of a car 64 long facing right (y down, its centre
// at the origin, the road 12 below), then covered by signed distance like the other shapes.
// Each function takes its position in px from the shape's middle and returns a premultiplied
// colour; `px` is the width of a device pixel and `t` is in ms.

/**
 * `hypercarColor`: the body, in car-paint with a flake and a clear coat that mirrors a studio of
 * soft boxes and a neon horizon, a sweeping highlight, a fresnel rim, a glass canopy, LED lamps
 * and a wing. `hcWheelColor`: a wheel, its spokes blurred by how fast it spins. `hcGlowColor`:
 * the neon beneath the car and on the road. `hcBeamColor`: the headlights' beam through dust.
 * `hcFlameColor`: the nitro's flame with its shock diamonds.
 */
export const HYPERCAR_GLSL = `
// The body's outline, nose to tail along the top and back along the sill; and the glass in it.
const vec2 HC_BODY[21] = vec2[21](
  vec2(33.0, 3.6), vec2(33.4, 0.8), vec2(31.8, -1.3), vec2(28.0, -2.6), vec2(22.0, -3.9),
  vec2(16.5, -5.2), vec2(12.0, -7.6), vec2(6.5, -10.2), vec2(1.0, -11.7), vec2(-5.0, -11.7),
  vec2(-11.0, -10.3), vec2(-16.5, -8.4), vec2(-22.0, -6.8), vec2(-27.0, -6.0), vec2(-31.5, -5.6),
  vec2(-33.6, -3.8), vec2(-33.8, 0.6), vec2(-32.2, 4.8), vec2(-28.0, 6.6), vec2(28.0, 6.6),
  vec2(31.6, 5.6)
);
const vec2 HC_GLASS[10] = vec2[10](
  vec2(15.0, -5.0), vec2(11.2, -7.2), vec2(6.2, -9.5), vec2(1.2, -10.7), vec2(-4.8, -10.7),
  vec2(-10.4, -9.4), vec2(-15.6, -7.6), vec2(-19.8, -6.2), vec2(-19.6, -5.2), vec2(14.6, -4.3)
);

float hcSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float hcBodyPoly(vec2 p) {
  float d = dot(p - HC_BODY[0], p - HC_BODY[0]);
  float s = 1.0;
  for (int i = 0; i < 21; i++) {
    int j = i == 0 ? 20 : i - 1;
    vec2 e = HC_BODY[j] - HC_BODY[i];
    vec2 w = p - HC_BODY[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= HC_BODY[i].y, p.y < HC_BODY[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}

float hcGlassPoly(vec2 p) {
  float d = dot(p - HC_GLASS[0], p - HC_GLASS[0]);
  float s = 1.0;
  for (int i = 0; i < 10; i++) {
    int j = i == 0 ? 9 : i - 1;
    vec2 e = HC_GLASS[j] - HC_GLASS[i];
    vec2 w = p - HC_GLASS[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= HC_GLASS[i].y, p.y < HC_GLASS[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}

// The body with its wheel arches cut out of it.
float hcCut(vec2 p) {
  float arch = min(length(p - vec2(21.5, 5.5)), length(p - vec2(-21.5, 5.5))) - 7.6;
  return max(hcBodyPoly(p), -arch);
}

// The studio the paint mirrors: r is where the reflection points (negative y is up).
vec3 hcEnv(vec3 r, float t, vec3 neon) {
  float y = r.y;
  vec3 sky = mix(vec3(0.62, 0.70, 0.86), vec3(0.03, 0.05, 0.13), pow(clamp(-y * 1.1, 0.0, 1.0), 0.55));
  vec3 ground = mix(vec3(0.10, 0.09, 0.12), vec3(0.01, 0.01, 0.03), clamp(y * 1.4, 0.0, 1.0));
  ground += neon * 0.28 * smoothstep(0.1, 0.9, y);
  vec3 env = mix(sky, ground, smoothstep(-0.04, 0.05, y));
  // The neon horizon of a city at night.
  env += mix(neon, vec3(1.0), 0.35) * exp(-pow((y - 0.0) / 0.07, 2.0)) * 0.9;
  // Tall strip lights, sliding by.
  float strips = smoothstep(0.12, 0.04, abs(fract(r.x * 0.8 + t * 0.00018 + 0.3) - 0.5)) * smoothstep(0.6, 0.2, abs(y + 0.4));
  env += vec3(0.95, 0.97, 1.0) * strips * 1.0;
  // An overhead softbox.
  env += vec3(1.0, 0.98, 0.95) * smoothstep(0.2, 0.04, abs(y + 0.82)) * smoothstep(0.7, 0.2, abs(r.x)) * 0.8;
  return env;
}

// A line of light: its core and its bloom, d px from it.
float hcLed(float d, float w) {
  return smoothstep(w, w * 0.35, d) + exp(-d * 0.9) * 0.35;
}

vec4 hypercarColor(vec2 p, float R, vec3 body, vec3 trim, vec3 neon, float ghost, float t, float px) {
  float sc = R / 32.0;
  p /= sc;
  float aa = px * 0.75 / sc;

  // --- silhouette ---
  float dBody = hcCut(p);
  float dWing = min(hcSeg(p, vec2(-35.4, -10.5), vec2(-25.0, -9.9)) - 0.9, hcSeg(p, vec2(-35.2, -13.6), vec2(-35.2, -8.6)) - 0.35);
  float dPylon = min(hcSeg(p, vec2(-31.0, -6.0), vec2(-31.4, -9.6)), hcSeg(p, vec2(-27.4, -6.0), vec2(-27.6, -9.3))) - 0.4;
  float dGlass = hcGlassPoly(p);
  float covBody = 1.0 - smoothstep(-aa, aa, dBody);
  float covWing = 1.0 - smoothstep(-aa, aa, min(dWing, dPylon));
  if (ghost > 0.5) {
    float cov = max(covBody, covWing);
    return vec4(neon * cov * 0.9, 0.0);
  }

  // --- the paint ---
  float e = 0.55;
  vec2 g = vec2(hcCut(p + vec2(e, 0.0)) - hcCut(p - vec2(e, 0.0)), hcCut(p + vec2(0.0, e)) - hcCut(p - vec2(0.0, e))) / (2.0 * e);
  float depth = max(-dBody, 0.0);
  float roll = 1.0 - smoothstep(0.0, 4.2, depth);
  vec2 nxy = normalize(g + 1e-4) * roll * 0.92;
  // The body bulges: its upper half faces up and its lower half down, with a crease along the shoulder.
  float crease = -2.2 + 0.07 * p.x;
  float above = smoothstep(crease + 0.5, crease - 0.5, p.y);
  nxy.y += clamp((p.y - crease) / 7.0, -1.0, 1.0) * 0.5 * (1.0 - above) - 0.42 * above;
  nxy = clamp(nxy, vec2(-0.97), vec2(0.97));
  float nzz = sqrt(max(1.0 - dot(nxy, nxy), 0.0));
  vec3 n = vec3(nxy, nzz);
  vec3 r = vec3(2.0 * n.z * n.x, 2.0 * n.z * n.y, 2.0 * n.z * n.z - 1.0);
  vec3 env = hcEnv(r, t, neon);
  vec3 L = normalize(vec3(-0.35, -0.75, 0.55));
  float lam = clamp(dot(n, L), 0.0, 1.0);
  float fres = 0.05 + 0.5 * pow(1.0 - n.z, 3.5);
  // Metallic flake that glints as the car moves.
  vec2 cell = floor(p * 3.0);
  float h = hash12(cell + 11.0);
  float flake = step(0.86, h) * pow(0.5 + 0.5 * sin(t * 0.004 + h * 80.0 + p.x * 0.5), 5.0);
  vec3 paint = body * (0.12 + 1.0 * lam);
  paint += body * env * 0.5;
  paint += env * fres * 0.95;
  paint += mix(body, vec3(1.0), 0.65) * flake * 0.4;
  // The highlight that sweeps down the length of the car, slanted and stretched along its curve.
  float sweepX = sin(t * 0.0011) * 38.0;
  float band = exp(-pow((p.x + p.y * 0.7 - sweepX) / 4.0, 2.0));
  paint += vec3(1.0, 0.99, 0.95) * band * (0.25 + 0.55 * smoothstep(0.1, 0.9, -n.y + 0.2)) * (0.4 + 0.6 * n.z);
  // A hairline of light on the shoulder crease.
  paint += vec3(1.0) * exp(-pow((p.y - crease) / 0.35, 2.0)) * smoothstep(-28.0, -20.0, p.x) * smoothstep(30.0, 22.0, p.x) * 0.45;
  // Dark underneath, lit again by the neon on the road.
  paint *= mix(0.5, 1.0, smoothstep(7.0, -0.5, p.y));
  paint += neon * smoothstep(-0.5, 6.6, p.y) * 0.14;
  // Fresnel rim in the neon.
  paint += neon * pow(1.0 - n.z, 2.4) * 0.3;

  // --- panel details ---
  // The side intake: a dark scoop with slats.
  float dIntake = sdEllipse(p - vec2(-10.5, 1.0), vec2(6.4, 2.5));
  float intake = 1.0 - smoothstep(-aa, aa, dIntake);
  float slats = 0.5 + 0.5 * step(0.5, fract(p.x * 0.8));
  paint = mix(paint, vec3(0.01, 0.012, 0.02) * slats + neon * 0.05, intake * 0.92);
  paint += mix(neon, vec3(1.0), 0.4) * exp(-pow(dIntake / 0.4, 2.0)) * 0.35;
  // Door shut lines.
  float door = min(hcSeg(p, vec2(9.0, -4.6), vec2(7.6, 5.2)), hcSeg(p, vec2(-3.0, -4.8), vec2(-4.8, 4.0)));
  paint *= 1.0 - 0.5 * smoothstep(0.5, 0.15, door) * step(p.y, 5.8);
  // The splitter, the diffuser and the louvres over the engine.
  paint *= 1.0 - 0.6 * smoothstep(27.0, 29.5, p.x) * smoothstep(3.6, 4.4, p.y);
  float fins = 0.55 + 0.45 * step(0.5, fract(p.x * 1.3));
  paint = mix(paint, vec3(0.01) * fins, smoothstep(-28.2, -29.8, p.x) * smoothstep(2.0, 3.0, p.y) * 0.85);
  float louver = step(0.62, 0.5 + 0.5 * sin(p.x * 2.1)) * smoothstep(0.7, 1.4, depth) * (1.0 - smoothstep(1.8, 2.6, depth)) * step(p.x, -13.0) * step(-24.0, p.x) * above;
  paint *= 1.0 - 0.7 * louver;
  // Neon accents: a line down the sill that pulses forward, and a fainter one on the shoulder.
  float dSill = abs(p.y - 4.7);
  float sillRun = smoothstep(-27.0, -24.0, p.x) * smoothstep(27.0, 24.0, p.x) * step(abs(p.x), 27.0);
  float pulse = 0.72 + 0.28 * sin(p.x * 0.3 - t * 0.012);
  vec3 neonHot = mix(neon, vec3(1.0), 0.55);
  paint += neonHot * smoothstep(0.4, 0.12, dSill) * sillRun * pulse * 1.0;
  paint += neon * exp(-dSill * 1.6) * sillRun * 0.15 * pulse;
  float dShoulder = abs(p.y - (crease + 0.9));
  paint += neon * smoothstep(0.4, 0.1, dShoulder) * smoothstep(-26.0, -22.0, p.x) * smoothstep(26.0, 20.0, p.x) * 0.5;
  // Exhausts.
  float dPipe = length(p - vec2(-33.0, 2.6)) - 1.45;
  paint = mix(paint, mix(vec3(0.01), vec3(0.75, 0.78, 0.85), smoothstep(-0.9, -0.5, dPipe)), 1.0 - smoothstep(-aa, aa, dPipe));

  // --- the lamps: a slanted LED blade up front and a taillight bar behind ---
  float dHead = hcSeg(p, vec2(25.2, -2.6), vec2(31.0, -1.3));
  float dDrl = hcSeg(p, vec2(27.0, -0.6), vec2(32.6, 0.7));
  float ledU = clamp((p.x - 25.2) / 5.8, 0.0, 1.0);
  float ledDots = 0.7 + 0.3 * step(0.5, fract(ledU * 4.0));
  paint *= 1.0 - 0.7 * smoothstep(1.7, 0.9, dHead);
  vec3 headCol = vec3(0.86, 0.95, 1.0);
  paint += headCol * smoothstep(0.65, 0.25, dHead) * ledDots * 1.8;
  paint += headCol * exp(-dHead * 0.8) * 0.5;
  paint += mix(neon, vec3(1.0), 0.6) * smoothstep(0.35, 0.1, dDrl) * 1.4;
  float dTail = hcSeg(p, vec2(-30.6, -3.6), vec2(-33.5, -0.9));
  float brake = 0.85 + 0.15 * sin(t * 0.02);
  paint *= 1.0 - 0.6 * smoothstep(1.6, 0.8, dTail);
  paint += vec3(1.0, 0.18, 0.12) * smoothstep(0.7, 0.2, dTail) * 2.0 * brake;
  paint += vec3(1.0, 0.7, 0.6) * smoothstep(0.3, 0.0, dTail) * 0.8;
  paint += vec3(1.0, 0.1, 0.08) * exp(-dTail * 0.7) * 0.45 * brake;

  vec4 col = vec4(paint * covBody, covBody);

  // --- the wing: carbon with a neon edge ---
  float wy = clamp((p.y + 10.5) / 2.0, -1.0, 1.0);
  vec3 carbon = trim * 1.2 + vec3(0.05);
  carbon *= 0.6 + 0.4 * (0.5 + 0.5 * wy);
  carbon += vec3(1.0) * exp(-pow((p.x + 30.0 - sweepX * 0.2) / 3.0, 2.0)) * 0.3;
  carbon += neon * smoothstep(0.45, 0.0, abs(p.y + 9.7 - (p.x + 30.0) * 0.06)) * 0.9 * step(p.y, -9.6);
  col = over(vec4(carbon * covWing, covWing), col);

  // --- the glass canopy ---
  float covGlass = (1.0 - smoothstep(-aa, aa, dGlass)) * covBody;
  // A pillar of paint between the panes.
  covGlass *= smoothstep(0.35, 0.75, abs(p.x + 8.4 + p.y * 0.25));
  if (covGlass > 0.001) {
    float gy = clamp((p.y + 8.0) / 4.5, -1.0, 1.0);
    vec3 gr = vec3(p.x * 0.015, gy * 0.8 - 0.1, 0.55);
    vec3 glassEnv = hcEnv(normalize(gr), t, neon) * 0.5;
    // The cabin: dark, with a helmet and the glow of a dash.
    vec3 cabin = vec3(0.012, 0.018, 0.035) + neon * 0.1 * smoothstep(-5.5, -4.2, p.y);
    float dHelmet = sdEllipse(p - vec2(0.4, -7.4), vec2(2.5, 2.7));
    float dSeat = sdEllipse(p - vec2(-4.0, -6.6), vec2(2.0, 4.0));
    float helmet = 1.0 - smoothstep(-0.2, 0.3, dHelmet);
    cabin = mix(cabin, vec3(0.03, 0.035, 0.05) + neon * 0.04, (1.0 - smoothstep(-0.2, 0.3, dSeat)) * 0.8);
    cabin = mix(cabin, mix(body, vec3(0.9), 0.4) * (0.35 + 0.5 * smoothstep(-0.5, -2.0, dHelmet)), helmet);
    float visor = (1.0 - smoothstep(-0.1, 0.2, sdEllipse(p - vec2(1.9, -7.7), vec2(1.2, 0.8)))) * helmet;
    cabin = mix(cabin, vec3(0.0, 0.02, 0.05) + neon * 0.25, visor);
    vec3 glass = cabin + glassEnv * 0.9;
    // Two bright streaks of reflection, one stretched along the roof.
    float s1 = smoothstep(2.0, 0.0, abs(dot(p, vec2(0.87, 0.5)) + 2.5 - sweepX * 0.15));
    float s2 = smoothstep(0.8, 0.0, abs(dot(p, vec2(0.87, 0.5)) + 8.5 - sweepX * 0.15));
    glass += vec3(0.9, 0.97, 1.0) * (s1 * 0.5 + s2 * 0.45);
    glass += vec3(1.0) * exp(-pow((dGlass + 0.4) / 0.35, 2.0)) * 0.35;
    col = over(vec4(glass * covGlass, covGlass), col);
  }
  // The mirror, a pod of paint on the door.
  float dMirror = sdEllipse(p - vec2(9.6, -4.6), vec2(2.2, 1.0));
  float covMirror = (1.0 - smoothstep(-aa, aa, dMirror)) * covBody;
  vec3 mirrorCol = body * (0.5 + 0.7 * (0.5 - (p.y + 4.6) * 0.5)) + env * 0.3;
  col = over(vec4(mirrorCol * covMirror, covMirror), col);

  // --- the neon's bloom round it all ---
  float dAll = min(dBody, min(dWing, dPylon));
  col += vec4(neon * exp(-max(dAll, 0.0) * 0.45) * 0.07, 0.0);
  return col;
}

// A wheel, in px from its hub, \`R\` to the tyre's edge: \`spin\` is how far it has turned, \`blur\` how
// much of a spoke's gap it sweeps in a frame (0 to 1) and \`brake\` how hot the disc glows.
vec4 hcWheelColor(vec2 p, float R, float spin, float blur, float brake, vec3 neon, float t, float px) {
  p /= R;
  float aa = px * 0.75 / R;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float cov = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  vec3 col = vec3(0.0);
  // The tyre, with a tread that shimmers when it turns slowly and blurs flat when it does not.
  float tread = 0.5 + 0.5 * sin((ang - spin) * 34.0);
  col = vec3(0.022, 0.024, 0.032) + vec3(0.06) * smoothstep(0.84, 0.97, r) * mix(tread, 0.5, blur);
  col += vec3(0.16) * smoothstep(0.78, 0.9, r) * smoothstep(1.0, 0.92, r) * (0.5 + 0.5 * cos(ang + 2.2));
  // A thin neon line on the sidewall.
  col += neon * exp(-pow((r - 0.82) / 0.025, 2.0)) * 0.8;
  // Inside the rim: the disc, drilled, and its caliper.
  float rimR = 0.7;
  float discMask = smoothstep(rimR, rimR - 0.04, r);
  float holes = smoothstep(0.35, 0.5, 0.5 + 0.5 * sin(ang * 16.0 - spin)) * smoothstep(0.38, 0.42, r) * smoothstep(0.58, 0.54, r);
  vec3 disc = vec3(0.34, 0.35, 0.4) * (0.55 + 0.45 * cos(ang * 1.0 + 1.0)) * (1.0 - 0.55 * mix(holes, 0.5, blur));
  vec3 hot = vec3(1.0, 0.26, 0.04) * brake;
  disc += hot * (0.5 + 0.9 * smoothstep(0.25, 0.6, r)) * 1.2;
  col = mix(col, disc, discMask);
  float dCal = abs(ang + 0.9);
  float caliper = smoothstep(0.34, 0.26, dCal) * smoothstep(0.38, 0.44, r) * smoothstep(0.64, 0.58, r);
  col = mix(col, mix(neon, vec3(1.0), 0.1) * 0.9, caliper);
  // The spokes: ten of them, each tapering to the hub, averaged over the angle the wheel sweeps.
  float swept = blur * 0.628;
  float spokes = 0.0;
  for (int i = 0; i < 6; i++) {
    float a = ang - spin + (float(i) / 5.0 - 0.5) * swept;
    float s = abs(cos(a * 5.0));
    float width = mix(0.9, 0.82, smoothstep(0.2, 0.7, r));
    spokes += smoothstep(width - 0.05, width + 0.05, s);
  }
  spokes /= 6.0;
  float spokeZone = smoothstep(0.18, 0.24, r) * smoothstep(rimR, rimR - 0.05, r);
  vec3 alloy = mix(vec3(0.45, 0.47, 0.52), vec3(0.95, 0.97, 1.0), 0.5 + 0.5 * cos(ang + 2.2)) * (0.5 + 0.5 * smoothstep(0.2, 0.7, r));
  alloy = mix(alloy, vec3(0.7), blur * 0.4);
  col = mix(col, alloy, spokes * spokeZone);
  // The rim's lip, catching the light.
  float lip = exp(-pow((r - rimR) / 0.05, 2.0));
  col += vec3(0.95, 0.97, 1.0) * lip * (0.35 + 0.55 * (0.5 + 0.5 * cos(ang + 2.2)));
  // The hub: a cap with a neon ring.
  float hub = 1.0 - smoothstep(0.15, 0.19, r);
  col = mix(col, vec3(0.75, 0.78, 0.85) * (0.7 + 0.3 * cos(ang * 5.0)), hub);
  col += neon * exp(-pow((r - 0.2) / 0.025, 2.0)) * 0.7;
  col += vec3(1.0) * (1.0 - smoothstep(0.0, 0.07, r)) * 0.5;
  // The disc's heat leaks round the tyre as a glow.
  vec3 bloom = hot * exp(-max(r - 0.5, 0.0) * 5.0) * 0.12;
  return vec4(col * cov + bloom * cov, cov);
}

// The neon under the car: a tube down each sill spilling onto the road, and its reflection.
vec4 hcGlowColor(vec2 p, float R, float strength, vec3 neon, float t) {
  float sc = R / 32.0;
  p /= sc;
  float ground = 12.0;
  float inside = smoothstep(31.0, 20.0, abs(p.x));
  // Light thrown down from the sill onto the road.
  float spill = smoothstep(ground + 0.5, 7.0, p.y) * step(7.0, p.y) * inside * 0.55;
  // The pool on the road, which breathes and shimmers along its length.
  vec2 pool = vec2(p.x / 36.0, (p.y - ground) / 3.4);
  float pd = length(pool);
  float shimmer = 0.8 + 0.2 * sin(p.x * 0.5 - t * 0.008) + 0.12 * snoise(vec2(p.x * 0.1 + t * 0.001, 2.0));
  float onRoad = exp(-pd * pd * 1.6) * shimmer;
  // Its reflection in the wet road, fading down.
  float below = smoothstep(ground - 0.5, ground + 1.5, p.y) * exp(-(p.y - ground) * 0.25) * inside;
  float tube = exp(-pow((p.y - 7.0) / 0.5, 2.0)) * inside * 1.2;
  vec3 rgb = neon * (spill * 0.4 + onRoad * 0.5 + below * 0.14 + tube * 0.3);
  rgb += mix(neon, vec3(1.0), 0.6) * onRoad * 0.12;
  rgb += neon * exp(-pow(max(abs(p.x) - 28.0, 0.0) / 6.0, 2.0)) * exp(-pow((p.y - 9.0) / 7.0, 2.0)) * 0.25;
  return vec4(rgb * strength, 0.0);
}

// The headlights' beam: \`p\` is in px from the middle of its length \`len\`, \`w0\` and \`w1\` its half widths at each end.
vec4 hcBeamColor(vec2 p, float len, float w0, float w1, float strength, vec3 col, float t) {
  float u = clamp((p.x + len * 0.5) / len, 0.0, 1.0);
  float hw = mix(w0, w1, pow(u, 0.8));
  float v = p.y / hw;
  float along = pow(1.0 - u, 1.7) * smoothstep(0.0, 0.04, u);
  float across = exp(-v * v * 2.4);
  float dust = 0.78 + 0.45 * snoise(vec2(u * 7.0 - t * 0.0022, v * 1.4 + 3.0));
  float rays = 0.85 + 0.15 * sin(v * 9.0 + snoise(vec2(u * 3.0, 1.0)) * 2.0);
  float a = along * across * dust * rays * strength;
  vec3 rgb = mix(col, vec3(1.0), 0.45 * along) * a * 0.62;
  return vec4(rgb, 0.0);
}

// The nitro's flame, streaming back along +x from the exhaust at x = -len/2: \`hw\` is its half width there.
vec4 hcFlameColor(vec2 p, float len, float hw, float strength, vec3 col, float t) {
  float u = clamp((p.x + len * 0.5) / len, 0.0, 1.0);
  float wob = snoise(vec2(u * 5.0 - t * 0.022, 3.0)) * hw * 0.35 * u;
  float v = (p.y - wob) / hw;
  float taper = (1.0 - pow(u, 1.3)) * (0.55 + 0.45 * smoothstep(0.0, 0.1, u));
  float width = max(taper, 0.001);
  float vv = v / width;
  float body = exp(-vv * vv * 1.6) * (1.0 - smoothstep(0.7, 1.0, u));
  float core = exp(-vv * vv * 7.0) * (1.0 - smoothstep(0.25, 0.7, u));
  // Shock diamonds along the core.
  float diamonds = pow(0.5 + 0.5 * sin(u * 26.0 - t * 0.012), 5.0) * exp(-vv * vv * 5.0) * (1.0 - smoothstep(0.1, 0.8, u));
  float flick = 0.82 + 0.18 * sin(t * 0.05 + u * 4.0);
  vec3 outer = col * body;
  vec3 mid = mix(col, vec3(1.0, 0.9, 0.7), 0.6) * body * 0.5;
  vec3 hot = vec3(0.65, 0.82, 1.0) * core * 1.6 + vec3(0.9, 0.95, 1.0) * diamonds * 1.3;
  return vec4((outer * 1.1 + mid + hot) * flick * strength, 0.0);
}
`;
