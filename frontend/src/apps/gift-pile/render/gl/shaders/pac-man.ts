// Pac-Man, his ghost, the pellets, the neon lane he eats along and the pop as he goes, drawn
// entirely in GLSL. Chunks for the shapes shader (`shapes.ts`), after `noise.ts`: they need
// `snoise` and the `TAU` the shader defines before them. Every name here starts with `pm`, so
// it cannot clash with another chunk. Each takes its position in px from the shape's middle
// and returns a premultiplied colour (additive where its alpha is 0), with `t` in ms and `px` the width of a device pixel.

/**
 * `vec4 pmPacMan(...)`: Pac-Man, `R` px to his rim, a glossy sphere lit from the upper left with
 * a hot spot, a fresnel rim and a bounce of warm light from below, a dark hollow where his
 * mouth is cut (`mouth` is its half angle, `facing` the way it points), one eye, and a neon
 * halo. `dying` from 0 to 1 takes the eye and the halo away.
 */
export const PM_PAC_MAN_GLSL = `
vec4 pmPacMan(vec2 p, float R, float mouth, float facing, float glow, vec3 col, float dying, vec3 lip, float t, float px) {
  vec2 u = p / R;
  float aa = px * 0.75 / R;
  float r = length(u);
  float dDisc = r - 1.0;

  // The mouth: a wedge pointing along 'facing', cut from the sphere.
  vec2 w = mat2(cos(facing), -sin(facing), sin(facing), cos(facing)) * u;
  vec2 q = vec2(w.x, abs(w.y));
  vec2 e = vec2(cos(mouth), sin(mouth));
  float cr = q.x * e.y - q.y * e.x;
  float dEdge = dot(q, e) > 0.0 ? abs(cr) : length(q);
  float sdW = cr > 0.0 ? -dEdge : dEdge; // negative inside the wedge
  float dBody = max(dDisc, -sdW);
  float covBody = 1.0 - smoothstep(-aa, aa, dBody);
  float covHollow = 1.0 - smoothstep(-aa, aa, max(dDisc, sdW));

  // --- the sphere ---
  vec3 n = normalize(vec3(u.x, u.y, sqrt(max(1.0 - min(r * r, 1.0), 0.001))));
  vec3 L = normalize(vec3(-0.45, -0.6, 0.66));
  float diff = dot(n, L);
  float lit = clamp(diff * 0.5 + 0.5, 0.0, 1.0);
  vec3 shade = col * vec3(0.46, 0.2, 0.07);
  vec3 body = mix(shade, col * 1.06, pow(smoothstep(0.3, 0.95, lit), 0.85));
  body = mix(body, vec3(1.0, 0.98, 0.82), pow(max(diff, 0.0), 3.0) * 0.32);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(n, H), 0.0);
  body += vec3(1.0, 0.97, 0.88) * (pow(nh, 70.0) * 1.5 + pow(nh, 14.0) * 0.16);
  float fres = pow(clamp(1.0 - n.z, 0.0, 1.0), 3.0);
  body += mix(col, vec3(1.0), 0.6) * fres * 0.8 * (0.6 + 0.4 * glow);
  float bounce = pow(clamp(1.0 - n.z, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.8, dot(n.xy, normalize(vec2(0.5, 0.7))));
  body += vec3(1.0, 0.5, 0.18) * bounce * 0.24;
  // A glow from within, breathing a little.
  body += col * exp(-r * r * 3.0) * 0.16 * glow * (0.85 + 0.15 * sin(t * 0.005));
  // Faint scanlines, as on a tube.
  body *= 1.0 - 0.07 * (0.5 + 0.5 * sin(p.y * 2.4));
  // A thin bright seam round the silhouette and along the cut.
  float seam = smoothstep(0.06, 0.0, -dDisc) * step(dDisc, 0.0);
  body = mix(body, lip, seam * 0.5);
  float cut = max(sdW, 0.0);
  body = mix(body, shade * 0.35, (1.0 - smoothstep(0.0, 0.2, cut)) * 0.7);
  body = mix(body, lip * 1.15, smoothstep(0.05, 0.0, cut) * 0.85);

  // The eye, above his mouth whichever way he faces: dark and glossy, with a glint.
  vec2 ec = vec2(0.13 * cos(facing), -0.5);
  vec2 ev = (u - ec) / vec2(0.15, 0.18);
  float eye = (1.0 - smoothstep(-aa * 6.0, aa * 6.0, length(ev) - 1.0)) * (1.0 - smoothstep(0.0, 0.05, dying));
  vec3 eyeCol = mix(vec3(0.02, 0.03, 0.08), vec3(0.18, 0.22, 0.38), (1.0 - smoothstep(0.0, 1.0, length(ev - vec2(-0.2, -0.3)))) * 0.5);
  eyeCol += vec3(1.0) * (1.0 - smoothstep(0.0, 0.32, length(ev - vec2(-0.3, -0.38))));
  body = mix(body, eyeCol, eye);

  // The inside of the sphere through the cut: dark, lit a little at its far rim.
  vec3 hollow = mix(vec3(0.02, 0.006, 0.0), col * vec3(0.32, 0.13, 0.04), smoothstep(0.25, 1.0, r));
  hollow += lip * smoothstep(0.85, 1.0, r) * 0.25;

  hollow = mix(hollow, col * 0.8, dying * 0.8);
  vec3 rgb = body * covBody + hollow * covHollow * 0.92;
  float a = covBody + covHollow * 0.92;
  // The neon halo, outside the sphere.
  float halo = exp(-max(dDisc, 0.0) * 5.0) * (1.0 - smoothstep(0.3, 0.58, dDisc)) * (1.0 - covBody);
  rgb += col * halo * 0.45 * glow * (1.0 - dying);
  return vec4(rgb, min(a, 1.0));
}
`;

/**
 * `vec4 pmGhost(...)`: the ghost, half `R` px across: a translucent ectoplasm body with noise
 * drifting through it, a skirt that wobbles and slides, glossy eyes looking along `look` (a
 * unit vector), or, when `scared`, pale dots for eyes and a zigzag mouth; and a glow round it.
 */
export const PM_GHOST_GLSL = `
vec4 pmGhost(vec2 p, float R, float scared, vec2 look, vec3 col, float t, float px) {
  vec2 u = p / R;
  float aa = px * 0.75 / R;
  vec2 c0 = vec2(0.0, -0.12);

  // The body: a dome over straight sides over a skirt of rounded tongues that slide and wobble.
  float d;
  if (u.y < c0.y) {
    d = length(u - c0) - 1.0;
  } else {
    float ph = (u.x * 0.5 + 0.5) * 4.0 + t * 0.0035;
    float f = fract(ph) * 2.0 - 1.0;
    float bump = sqrt(max(1.0 - f * f, 0.0));
    float hem = 0.72 + 0.2 * bump * (0.85 + 0.15 * sin(t * 0.009 + floor(ph) * 1.7)) + 0.05 * snoise(vec2(u.x * 2.5, t * 0.003));
    d = max(abs(u.x) - 1.0, (u.y - hem) * 0.75);
  }
  float cov = 1.0 - smoothstep(-aa, aa, d);

  // Ectoplasm: lighter on top, clouds drifting up through it, veins of light.
  float nz = snoise(u * 1.4 + vec2(0.0, t * 0.0012));
  float nz2 = snoise(u * 2.6 + vec2(t * 0.0015, nz * 0.6));
  vec3 base = mix(col * 0.55, col * 1.15, smoothstep(0.9, -0.9, u.y));
  base += col * 0.16 * nz;
  base += mix(col, vec3(1.0), 0.6) * pow(1.0 - abs(nz2), 5.0) * 0.14;
  vec3 n = normalize(vec3(u.x * 0.8, (u.y + 0.1) * 0.7, sqrt(max(1.0 - min(dot(u, u) * 0.6, 0.95), 0.05))));
  float fres = pow(clamp(1.0 - n.z, 0.0, 1.0), 2.2);
  base += mix(col, vec3(1.0), 0.6) * fres * 0.9;
  float alpha = (0.64 + 0.3 * fres + 0.08 * nz) * mix(1.0, 0.62, smoothstep(0.35, 1.0, u.y));
  alpha = clamp(alpha, 0.0, 1.0);
  // It shines by itself, as well as through.
  vec3 rgb = (base * alpha + col * 0.3) * cov;
  float a = alpha * cov;
  // A soft highlight over its brow, with a hard glint in it.
  vec2 hb = u - vec2(-0.36, -0.74);
  float ca = cos(-0.4);
  float sa = sin(-0.4);
  hb = vec2(ca * hb.x - sa * hb.y, sa * hb.x + ca * hb.y);
  float brow = 1.0 - smoothstep(0.0, 1.0, length(hb / vec2(0.36, 0.14)));
  rgb += vec3(1.0) * brow * 0.38 * cov;
  rgb += vec3(1.0) * (1.0 - smoothstep(0.0, 1.0, length(hb / vec2(0.12, 0.045)))) * 0.45 * cov;

  // The face.
  vec3 faceRgb = vec3(0.0);
  float faceA = 0.0;
  if (scared > 0.5) {
    for (int i = 0; i < 2; i++) {
      float sx = i == 0 ? -1.0 : 1.0;
      float dot_ = 1.0 - smoothstep(-aa * 3.0, aa * 3.0, length(u - vec2(sx * 0.34, -0.2)) - 0.1);
      faceRgb += vec3(1.0, 0.86, 0.78) * dot_;
      faceA += dot_;
    }
    float zig = abs(fract(u.x * 2.4) - 0.5) * 2.0;
    float my = 0.3 + 0.1 * zig;
    float m = (1.0 - smoothstep(0.02, 0.05, abs(u.y - my))) * (1.0 - smoothstep(0.52, 0.62, abs(u.x)));
    faceRgb += vec3(1.0, 0.9, 0.82) * m;
    faceA += m;
  } else {
    vec3 L = normalize(vec3(-0.45, -0.6, 0.66));
    for (int i = 0; i < 2; i++) {
      float sx = i == 0 ? -1.0 : 1.0;
      vec2 ec = vec2(sx * 0.38, -0.18);
      vec2 ev = (u - ec) / vec2(0.25, 0.31);
      float eCov = 1.0 - smoothstep(-aa * 4.0, aa * 4.0, length(ev) - 1.0);
      vec3 en = normalize(vec3(ev.x, ev.y, sqrt(max(1.0 - min(dot(ev, ev), 1.0), 0.001))));
      vec3 white = mix(vec3(1.0), vec3(0.62, 0.74, 1.0), smoothstep(-0.2, 1.0, ev.y) * 0.5) * (0.8 + 0.25 * dot(en, L));
      // The pupil, pushed towards where it is looking.
      vec2 pv = (u - ec - look * vec2(0.1, 0.12)) / vec2(0.125, 0.16);
      float pCov = 1.0 - smoothstep(-aa * 4.0, aa * 4.0, length(pv) - 1.0);
      vec3 pupil = mix(vec3(0.03, 0.07, 0.3), vec3(0.15, 0.32, 0.9), (1.0 - smoothstep(0.0, 1.2, length(pv - vec2(0.0, 0.4)))) * 0.7);
      vec3 eye = mix(white, pupil, pCov);
      eye += vec3(1.0) * (1.0 - smoothstep(0.0, 0.3, length(pv - vec2(-0.32, -0.36)))) * pCov;
      eye += vec3(1.0) * (1.0 - smoothstep(0.0, 0.4, length(ev - vec2(-0.4, -0.5)))) * 0.25 * (1.0 - pCov);
      faceRgb += eye * eCov;
      faceA += eCov;
    }
  }
  float fa = clamp(faceA, 0.0, 1.0);
  rgb = rgb * (1.0 - fa) + faceRgb * cov;
  a = mix(a, cov, fa);

  // The glow round it.
  float halo = exp(-max(d, 0.0) * 4.0) * (1.0 - smoothstep(0.25, 0.5, d)) * (1.0 - cov);
  rgb += col * halo * 0.4;
  return vec4(rgb, min(a, 1.0));
}
`;

/**
 * `vec4 pmPellet(...)`: a neon pellet `R` px across, pulsing round its bloom, over a dark
 * pool so it reads on bright icons; a power pellet (`power` 1) is bigger and throws a cross
 * of light.
 */
export const PM_PELLET_GLSL = `
vec4 pmPellet(vec2 p, float R, float power, float phase, vec3 col, float t) {
  vec2 u = p / R;
  float r = length(u);
  float pulse = 0.72 + 0.28 * sin(t * (0.006 + 0.005 * power) + phase);
  vec3 hot = mix(col, vec3(1.0), 0.85);
  vec3 rgb = hot * smoothstep(0.42, 0.22, r) * 1.3;
  rgb += col * smoothstep(0.7, 0.3, r) * 0.8 * pulse;
  rgb += col * exp(-r * r * 1.6) * 0.7 * pulse * (1.0 - smoothstep(2.4, 3.2, r));
  float star = exp(-abs(u.y) / 0.07) * exp(-abs(u.x) * 0.55) + exp(-abs(u.x) / 0.07) * exp(-abs(u.y) * 0.55);
  rgb += hot * star * 0.8 * power * pulse * (1.0 - smoothstep(2.6, 3.2, r));
  float pool = 0.7 * exp(-r * r * 0.9) * (1.0 - smoothstep(1.8, 3.0, r));
  return vec4(rgb, pool);
}
`;

/**
 * `vec4 pmLane(...)`: the neon corridor he eats along, like a maze's: a dim, scanlined floor
 * between two glowing tubes `hw` px either side of its middle, with light chasing along them,
 * fading `ahead` px in front of him and `behind` px behind. `p` is from the middle of the
 * box, which is `(ahead - behind) / 2` in front of him.
 */
export const PM_LANE_GLSL = `
vec4 pmLane(vec2 p, float ahead, float behind, float hw, float strength, vec3 col, float t) {
  float s = p.x + (ahead - behind) * 0.5;
  float f = s > 0.0 ? pow(clamp(1.0 - s / ahead, 0.0, 1.0), 1.3) : pow(clamp(1.0 + s / behind, 0.0, 1.0), 1.3);
  float v = abs(p.y) / hw;
  float d = abs(v - 1.0) * hw;
  float core = exp(-pow(d / (0.055 * hw), 2.0));
  float bloom = exp(-d / (0.16 * hw)) * (v > 1.0 ? 0.8 : 1.0) * (1.0 - smoothstep(1.35, 2.1, v));
  float chase = 0.65 + 0.35 * sin(s / hw * 2.6 - t * 0.008);
  vec3 hot = mix(col, vec3(1.0), 0.75);
  vec3 rgb = hot * core * 1.3 * chase + col * bloom * 0.55 * chase;
  // The floor: dark, with faint bands along it, like a tube's scanlines.
  float floorM = 1.0 - smoothstep(0.92, 1.0, v);
  float scan = 0.5 + 0.5 * sin(p.y / hw * 16.0);
  rgb += col * floorM * (0.03 + 0.05 * scan);
  float dark = floorM * 0.32;
  return vec4(rgb * f * strength, dark * f * strength);
}
`;

/**
 * `vec4 pmPop(...)`: the pop as the last of him goes, `u` from 0 to 1, `R` px at its widest:
 * a flash, a ring of light and twelve rays flying out. For additive blending.
 */
export const PM_POP_GLSL = `
vec4 pmPop(vec2 p, float R, float u, vec3 col) {
  vec2 q = p / R;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float rr = 0.12 + 0.88 * (1.0 - pow(1.0 - u, 2.0));
  vec3 hot = mix(col, vec3(1.0), 0.75);
  float ring = exp(-pow((r - rr) / (0.035 + 0.06 * (1.0 - u)), 2.0)) * (1.0 - u);
  float rays = pow(abs(cos(ang * 6.0 + 0.1)), 22.0) * smoothstep(rr * 0.5, rr * 0.68, r) * smoothstep(rr * 1.02, rr * 0.8, r) * (1.0 - u * 0.5);
  float flash = exp(-r * r * 22.0) * (1.0 - u) * 1.4;
  float bloom = exp(-r * r * 4.0) * (1.0 - u) * (1.0 - u) * 0.5;
  vec3 rgb = col * ring * 1.3 + hot * ring * 0.4 + hot * rays * 1.2 + hot * flash + col * bloom;
  return vec4(rgb * (1.0 - smoothstep(0.85, 1.0, r)), 0.0);
}
`;
