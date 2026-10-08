import type { Color, Gfx, ShaderSource } from '../board';
import { parseColor } from '../../render/color';

// The hypercar, drawn entirely in GLSL through `Gfx.shade`. Everything is worked out in the car's
// own frame, in px of a car 64 long facing right (y down, its centre at the origin, the road 12
// below). Each source's `shade()` gets its position from the box's middle in caller units and
// returns a premultiplied colour; the prelude supplies `snoise`, `over`, `hash12`, `sdEllipse`
// and `sdSegment`. The paint mirrors a night studio unlike `envSky`'s, so the body keeps its own
// `env`.

/** The body's outline and glass as polygons, and the signed distance to them. */
const OUTLINE = `
// The body's outline, nose to tail along the top and back along the sill; and the glass in it.
const vec2 BODY[21] = vec2[21](
  vec2(33.0, 3.6), vec2(33.4, 0.8), vec2(31.8, -1.3), vec2(28.0, -2.6), vec2(22.0, -3.9),
  vec2(16.5, -5.2), vec2(12.0, -7.6), vec2(6.5, -10.2), vec2(1.0, -11.7), vec2(-5.0, -11.7),
  vec2(-11.0, -10.3), vec2(-16.5, -8.4), vec2(-22.0, -6.8), vec2(-27.0, -6.0), vec2(-31.5, -5.6),
  vec2(-33.6, -3.8), vec2(-33.8, 0.6), vec2(-32.2, 4.8), vec2(-28.0, 6.6), vec2(28.0, 6.6),
  vec2(31.6, 5.6)
);
const vec2 GLASS[10] = vec2[10](
  vec2(15.0, -5.0), vec2(11.2, -7.2), vec2(6.2, -9.5), vec2(1.2, -10.7), vec2(-4.8, -10.7),
  vec2(-10.4, -9.4), vec2(-15.6, -7.6), vec2(-19.8, -6.2), vec2(-19.6, -5.2), vec2(14.6, -4.3)
);

float bodyPoly(vec2 p) {
  float d = dot(p - BODY[0], p - BODY[0]);
  float s = 1.0;
  for (int i = 0; i < 21; i++) {
    int j = i == 0 ? 20 : i - 1;
    vec2 e = BODY[j] - BODY[i];
    vec2 w = p - BODY[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= BODY[i].y, p.y < BODY[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}

float glassPoly(vec2 p) {
  float d = dot(p - GLASS[0], p - GLASS[0]);
  float s = 1.0;
  for (int i = 0; i < 10; i++) {
    int j = i == 0 ? 9 : i - 1;
    vec2 e = GLASS[j] - GLASS[i];
    vec2 w = p - GLASS[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= GLASS[i].y, p.y < GLASS[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}

// The body with its wheel arches cut out of it.
float cut(vec2 p) {
  float arch = min(length(p - vec2(21.5, 5.5)), length(p - vec2(-21.5, 5.5))) - 7.6;
  return max(bodyPoly(p), -arch);
}
`;

/**
 * The body: car-paint with a flake and a clear coat that mirrors a studio of soft boxes and a
 * neon horizon, a sweeping highlight, a fresnel rim, a glass canopy, LED lamps and a wing.
 * With `ghost` only a neon silhouette.
 */
export const CAR_BODY_SHADER: ShaderSource = {
  key: 'hypercar/body',
  glsl: `
${OUTLINE}

// The studio the paint mirrors: r is where the reflection points (negative y is up).
vec3 studioEnv(vec3 r, float t, vec3 neon) {
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

vec4 carColor(vec2 p, float R, vec3 body, vec3 trim, vec3 neon, float ghost, float t, float px) {
  float sc = R / 32.0;
  p /= sc;
  float aa = px * 0.75 / sc;

  // --- silhouette ---
  float dBody = cut(p);
  float dWing = min(sdSegment(p, vec2(-35.4, -10.5), vec2(-25.0, -9.9)) - 0.9, sdSegment(p, vec2(-35.2, -13.6), vec2(-35.2, -8.6)) - 0.35);
  float dPylon = min(sdSegment(p, vec2(-31.0, -6.0), vec2(-31.4, -9.6)), sdSegment(p, vec2(-27.4, -6.0), vec2(-27.6, -9.3))) - 0.4;
  float dGlass = glassPoly(p);
  float covBody = 1.0 - smoothstep(-aa, aa, dBody);
  float covWing = 1.0 - smoothstep(-aa, aa, min(dWing, dPylon));
  if (ghost > 0.5) {
    float cov = max(covBody, covWing);
    return vec4(neon * cov * 0.9, 0.0);
  }

  // --- the paint ---
  float e = 0.55;
  vec2 g = vec2(cut(p + vec2(e, 0.0)) - cut(p - vec2(e, 0.0)), cut(p + vec2(0.0, e)) - cut(p - vec2(0.0, e))) / (2.0 * e);
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
  vec3 env = studioEnv(r, t, neon);
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
  float door = min(sdSegment(p, vec2(9.0, -4.6), vec2(7.6, 5.2)), sdSegment(p, vec2(-3.0, -4.8), vec2(-4.8, 4.0)));
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
  float dHead = sdSegment(p, vec2(25.2, -2.6), vec2(31.0, -1.3));
  float dDrl = sdSegment(p, vec2(27.0, -0.6), vec2(32.6, 0.7));
  float ledU = clamp((p.x - 25.2) / 5.8, 0.0, 1.0);
  float ledDots = 0.7 + 0.3 * step(0.5, fract(ledU * 4.0));
  paint *= 1.0 - 0.7 * smoothstep(1.7, 0.9, dHead);
  vec3 headCol = vec3(0.86, 0.95, 1.0);
  paint += headCol * smoothstep(0.65, 0.25, dHead) * ledDots * 1.8;
  paint += headCol * exp(-dHead * 0.8) * 0.5;
  paint += mix(neon, vec3(1.0), 0.6) * smoothstep(0.35, 0.1, dDrl) * 1.4;
  float dTail = sdSegment(p, vec2(-30.6, -3.6), vec2(-33.5, -0.9));
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
    vec3 glassEnv = studioEnv(normalize(gr), t, neon) * 0.5;
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

// P: R (half the car's length), body rgb. Q: trim rgb, ghost. color: the neon.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  return carColor(p, P.x, P.yzw, Q.xyz, color, Q.w, u_time, v_px);
}
`,
};

/** A wheel, its spokes blurred by how fast it spins. */
export const CAR_WHEEL_SHADER: ShaderSource = {
  key: 'hypercar/wheel',
  glsl: `
vec4 wheelColor(vec2 p, float R, float spin, float blur, float brake, vec3 neon, float t, float px) {
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

// P: R (the tyre's radius), spin, blur, brake. color: the neon.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  return wheelColor(p, P.x, P.y, P.z, P.w, color, u_time, v_px);
}
`,
};

/** The neon beneath the car and on the road. Meant for additive blending. */
export const CAR_GLOW_SHADER: ShaderSource = {
  key: 'hypercar/glow',
  glsl: `
vec4 glowColor(vec2 p, float R, float strength, vec3 neon, float t) {
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

// P: R (half the car's length), strength. color: the neon.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  return glowColor(p, P.x, P.y, color, u_time);
}
`,
};

/** The headlights' beam through dust, `p` from the middle of its length. Additive. */
export const CAR_BEAM_SHADER: ShaderSource = {
  key: 'hypercar/beam',
  glsl: `
vec4 beamColor(vec2 p, float len, float w0, float w1, float strength, vec3 col, float t) {
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

// P: length, half width at each end, strength. color: the beam's.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  return beamColor(p, P.x, P.y, P.z, P.w, color, u_time);
}
`,
};

/** The nitro's flame with its shock diamonds, streaming back from the exhaust. Additive. */
export const CAR_FLAME_SHADER: ShaderSource = {
  key: 'hypercar/flame',
  glsl: `
vec4 flameColor(vec2 p, float len, float hw, float strength, vec3 col, float t) {
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

// P: length, half width at the exhaust, strength. color: the flame's.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  return flameColor(p, P.x, P.y, P.z, color, u_time);
}
`,
};

/** What the hypercar remover compiles at startup. */
export const HYPERCAR_SHADERS: readonly ShaderSource[] = [
  CAR_BODY_SHADER,
  CAR_WHEEL_SHADER,
  CAR_GLOW_SHADER,
  CAR_BEAM_SHADER,
  CAR_FLAME_SHADER,
];

/** How a car looks. */
export interface CarLook {
  /** The paint, the wing's carbon, and the neon of the glow and the accents. */
  body: Color;
  trim: Color;
  neon: Color;
  tilt?: number;
  /** How far the wheels have turned (radians). */
  spin?: number;
  /** 0 to 1: how much the wheels' spokes smear. */
  blur?: number;
  /** 0 to 1: how hot the discs glow. */
  brake?: number;
  /** 0 to 1: the flame from the exhaust. */
  nitro?: number;
  /** 0 to 1: the headlight beam. */
  lights?: number;
  alpha?: number;
  /** Draw only a neon silhouette, additive. */
  ghost?: boolean;
}

/** The nitro's flame colour and the headlights' tint. */
const FLAME = '#f97316';
const HEADLIGHT = '#fef9c3';

/**
 * A procedural supercar facing right, `length` long, centred at (x, y) and tipped by `tilt`
 * (its wheels reach `length * 3/16` below the centre). Drawn back to front: the neon on the
 * road and the flame, the wheels, the body over them, then the beam.
 */
export function drawCar(gfx: Gfx, x: number, y: number, length: number, o: CarLook): void {
  const k = length / 64;
  const tilt = o.tilt ?? 0;
  const ex = Math.cos(tilt);
  const ey = Math.sin(tilt);
  const alpha = o.alpha ?? 1;
  const half = length / 2;
  const bodyP = [half, ...parseColor(o.body).slice(0, 3)];
  const trimQ = (ghost: number) => [...parseColor(o.trim).slice(0, 3), ghost];
  /** A point of the car, in its own frame (px of a car 64 long), in the world. */
  const at = (lx: number, ly: number): [number, number] => [
    x + (lx * ex - ly * ey) * k,
    y + (lx * ey + ly * ex) * k,
  ];
  if (o.ghost) {
    gfx.shade(
      CAR_BODY_SHADER,
      { x, y, halfW: 42 * k, halfH: 20 * k, rotation: tilt },
      { p: bodyP, q: trimQ(1), color: o.neon, alpha, blend: 'add' },
    );
    return;
  }
  // The neon on the road, and the nitro's flame, behind the car.
  gfx.shade(
    CAR_GLOW_SHADER,
    { x, y, halfW: 46 * k, halfH: 22 * k, rotation: tilt },
    { p: [half, 1], color: o.neon, alpha, blend: 'add' },
  );
  const nitro = o.nitro ?? 0;
  if (nitro > 0) {
    const flame = 74 * k;
    const [fx, fy] = at(-33.5, 2.6);
    gfx.shade(
      CAR_FLAME_SHADER,
      {
        x: fx - ex * flame * 0.5,
        y: fy - ey * flame * 0.5,
        halfW: flame * 0.5,
        halfH: 8 * k,
        rotation: tilt + Math.PI,
      },
      { p: [flame, 3.2 * k, nitro], color: FLAME, alpha, blend: 'add' },
    );
  }
  // The wheels, then the body over them.
  const radius = 6.2 * k;
  for (const wx of [-21.5, 21.5]) {
    const [cx, cy] = at(wx, 5.5);
    gfx.shade(
      CAR_WHEEL_SHADER,
      { x: cx, y: cy, halfW: radius * 1.3, halfH: radius * 1.3, rotation: tilt },
      { p: [radius, o.spin ?? 0, o.blur ?? 0, o.brake ?? 0], color: o.neon, alpha },
    );
  }
  gfx.shade(
    CAR_BODY_SHADER,
    { x, y, halfW: 42 * k, halfH: 20 * k, rotation: tilt },
    { p: bodyP, q: trimQ(0), color: o.neon, alpha },
  );
  // The headlights' beam, over it.
  const lights = o.lights ?? 0;
  if (lights > 0) {
    const beam = 110 * k;
    const aim = tilt + 0.13;
    const [lx, ly] = at(31, -1.4);
    gfx.shade(
      CAR_BEAM_SHADER,
      {
        x: lx + Math.cos(aim) * beam * 0.5,
        y: ly + Math.sin(aim) * beam * 0.5,
        halfW: beam * 0.5,
        halfH: 22 * k,
        rotation: aim,
      },
      { p: [beam, 1.2 * k, 17 * k, lights], color: HEADLIGHT, alpha, blend: 'add' },
    );
  }
}
