// The rescue helicopter, drawn entirely in GLSL. A chunk for the shapes shader (`shapes.ts`),
// after `noise.ts`: it needs `snoise`. It takes its position in px from the helicopter's cabin
// and returns a premultiplied colour. It faces right.

/**
 * `vec4 chopperColor(...)`: the helicopter in a box where one unit is `U` px (so the cabin is
 * about 22 units long): a glossy painted fuselage (a body colour with a stripe) lit as car paint,
 * mirroring a sky and a horizon with a highlight sweeping along it; a tinted cockpit with a
 * pilot and reflections; a mast, skids and a searchlight; a main rotor seen nearly edge on,
 * blurred into a disc with blades shimmering in it and a glow at their tips; a tail rotor turning
 * face on; and blinking lights with bloom. `px` is the width of a device pixel, `t` in ms.
 */
export const CHOPPER_GLSL = `
const vec2 CH_HUB = vec2(1.5, -9.8);
const vec2 CH_TAIL_HUB = vec2(-13.7, -5.6);

float chEllipse(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k1 > 1e-6 ? k0 * (k0 - 1.0) / k1 : -min(r.x, r.y);
}

// A capsule from a to b, ra wide at a and rb at b.
float chCapsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

float chBox(vec2 p, vec2 hs, float r) {
  vec2 q = abs(p) - hs + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float chSmin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// The painted body: cabin, engine cowl, tail boom and fin, blended into one shape.
float chBody(vec2 p) {
  float cabin = chEllipse(p - vec2(0.8, 0.6), vec2(11.4, 6.4));
  float cowl = chEllipse(p - vec2(-3.4, -5.2), vec2(5.4, 2.3));
  float boom = chCapsule(p, vec2(-5.5, -0.6), vec2(-13.2, -3.3), 3.9, 0.95);
  float fin = chCapsule(p, vec2(-12.9, -3.2), vec2(-14.9, -8.5), 1.0, 0.5);
  float d = chSmin(cabin, cowl, 2.2);
  d = chSmin(d, boom, 3.0);
  return chSmin(d, fin, 1.0);
}

// The sky and ground the paint mirrors: y is where the reflection points (negative is up).
vec3 chEnv(float y, float x, float t) {
  vec3 sky = mix(vec3(0.82, 0.92, 1.0), vec3(0.14, 0.30, 0.66), pow(clamp(-y * 1.15, 0.0, 1.0), 0.7));
  vec3 ground = mix(vec3(0.46, 0.38, 0.32), vec3(0.03, 0.04, 0.08), pow(clamp(y * 1.4, 0.0, 1.0), 0.6));
  vec3 env = mix(sky, ground, smoothstep(-0.05, 0.07, y));
  env += vec3(1.0, 0.94, 0.82) * exp(-pow((y + 0.03) / 0.07, 2.0)) * 0.9;
  float panel = smoothstep(0.08, 0.02, abs(y + 0.45)) * smoothstep(0.34, 0.12, abs(x * 0.6 - 0.2 + 0.2 * sin(t * 0.0006)));
  return env + vec3(panel * 1.1);
}

// Over: top above bottom, both premultiplied.
vec4 chOver(vec4 top, vec4 bottom) {
  return top + bottom * (1.0 - top.a);
}

// A tube of metal lit from above: the skids, struts, mast. v is -1 at the top of the tube to 1 at its foot.
vec4 chMetal(float d, float v, float aa, vec3 tint) {
  float cov = 1.0 - smoothstep(-aa, aa, d);
  float shade = 0.18 + 0.7 * smoothstep(1.0, -0.4, v);
  vec3 col = tint * shade + vec3(1.0, 0.98, 0.95) * exp(-pow((v + 0.45) / 0.22, 2.0)) * 0.7;
  return vec4(col * cov, cov);
}

vec4 chopperColor(vec2 p, float U, vec3 body, vec3 stripe, vec3 glassTint, float t, float px) {
  p /= U;
  float aa = px * 0.75 / U;
  vec4 col = vec4(0.0);

  // --- the skids and their struts, behind the body ---
  {
    vec3 steel = vec3(0.30, 0.34, 0.40);
    float s1 = chCapsule(p, vec2(-5.2, 6.2), vec2(-5.9, 10.9), 0.42, 0.34);
    float s2 = chCapsule(p, vec2(5.0, 6.4), vec2(5.8, 10.9), 0.42, 0.34);
    col = chOver(chMetal(s1, 0.0, aa, steel), col);
    col = chOver(chMetal(s2, 0.0, aa, steel), col);
    float rail = min(chCapsule(p, vec2(-10.2, 11.5), vec2(10.0, 11.5), 0.6, 0.6),
                     chCapsule(p, vec2(10.0, 11.5), vec2(12.0, 9.6), 0.6, 0.45));
    col = chOver(chMetal(rail, clamp((p.y - 11.5) / 0.6, -1.0, 1.0), aa, steel), col);
  }

  // --- the tail's horizontal stabiliser ---
  {
    float st = chCapsule(p, vec2(-9.6, -1.8), vec2(-13.4, -3.0), 0.55, 0.4);
    col = chOver(chMetal(st, 0.0, aa, body * 0.7), col);
  }

  // --- the painted fuselage ---
  float dB = chBody(p);
  float covB = 1.0 - smoothstep(-aa, aa, dB);
  if (covB > 0.001) {
    // A normal from the shape's own edge: round across, and facing us in the middle.
    float e = 0.12;
    vec2 gd = normalize(vec2(chBody(p + vec2(e, 0.0)) - chBody(p - vec2(e, 0.0)),
                             chBody(p + vec2(0.0, e)) - chBody(p - vec2(0.0, e))) + 1e-5);
    float rt = mix(5.0, max(mix(3.9, 0.95, clamp((-5.5 - p.x) / 7.7, 0.0, 1.0)), 0.8), smoothstep(-4.0, -7.0, p.x));
    float tt = clamp(-dB / rt, 0.0, 1.0);
    vec3 n = normalize(vec3(gd * (1.0 - tt * 0.95), 0.12 + tt * 0.88));

    // The paint: the body colour, a stripe sweeping up towards the tail, a dark belly panel.
    float stripeY = 2.0 - 0.13 * p.x;
    float stripeM = smoothstep(0.62, 0.42, abs(p.y - stripeY)) * smoothstep(12.0, 8.5, p.x) * smoothstep(-14.5, -11.5, p.x);
    float stripeM2 = smoothstep(0.22, 0.12, abs(p.y - stripeY - 1.25)) * smoothstep(11.0, 7.5, p.x) * smoothstep(-13.5, -10.5, p.x);
    float belly = smoothstep(4.0, 4.5, p.y - 0.06 * p.x) * smoothstep(-8.0, -3.0, p.x);
    vec3 albedo = mix(body, stripe, max(stripeM, stripeM2 * 0.9));
    albedo = mix(albedo, vec3(0.20, 0.23, 0.29), belly * 0.9);
    // The engine cowl is darker and matt on top.
    float cowlM = 1.0 - smoothstep(-0.8, 0.6, chEllipse(p - vec2(-3.4, -5.4), vec2(3.4, 1.3)));
    albedo = mix(albedo, albedo * 0.8 + vec3(0.03, 0.035, 0.045), cowlM * 0.5);

    vec3 L = normalize(vec3(-0.30, -0.78, 0.55));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    float hemi = 0.5 - 0.5 * n.y;
    vec3 lit = albedo * (0.16 + 0.55 * hemi * vec3(0.85, 0.95, 1.1) + 0.7 * diff);
    // Clear coat: a mirror of the sky and the horizon, more where the paint turns away.
    vec3 refl = vec3(2.0 * n.z * n.x, 2.0 * n.z * n.y, 2.0 * n.z * n.z - 1.0);
    vec3 env = chEnv(refl.y * 0.95 + 0.02, refl.x, t) * mix(vec3(1.0), albedo, 0.28);
    float fres = pow(1.0 - n.z, 3.0);
    lit = mix(lit, env, clamp(0.16 + 0.80 * fres, 0.0, 0.92) * mix(1.0, 0.6, belly));
    // A tight specular spot, and a glint sweeping along the paint every few seconds.
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    lit += vec3(1.0, 0.97, 0.9) * pow(max(dot(n, H), 0.0), 55.0) * 0.9;
    float sweepAt = -22.0 + mod(t * 0.011, 52.0);
    float along = p.x * 0.85 - p.y * 0.55;
    lit += vec3(1.0, 0.98, 0.92) * exp(-pow((along - sweepAt) / 1.3, 2.0)) * (0.25 + 0.5 * n.z) * smoothstep(0.0, 0.6, tt) * 0.8;
    // Shadow under the belly and a cool rim from the sky along the top.
    lit *= mix(1.0, 0.5, smoothstep(0.2, 0.9, n.y) * smoothstep(1.5, 4.0, p.y));
    lit += vec3(0.55, 0.82, 1.0) * pow(1.0 - n.z, 2.4) * smoothstep(0.2, -0.8, n.y) * 0.5;
    // The panel line between the cabin and the boom.
    lit *= 1.0 - 0.35 * smoothstep(0.16, 0.0, abs(p.x + 6.9 - 0.04 * p.y)) * step(-4.5, p.y) * step(p.y, 4.5);
    col = chOver(vec4(lit * covB, covB), col);

    // --- the cockpit: the windscreen and the side window, tinted glass with a pilot ---
    float pillar = 1.7 + 0.5 * (p.y + 0.6);
    float wind = max(chEllipse(p - vec2(6.9, -0.5), vec2(5.4, 3.7)), pillar - p.x);
    float side = chBox(p - vec2(-1.7, -0.55), vec2(2.5, 2.3), 1.0);
    side = max(side, p.x - (pillar - 0.5));
    float dG = max(min(wind, side), dB + 0.35);
    float covG = 1.0 - smoothstep(-aa, aa, dG);
    if (covG > 0.001) {
      vec2 gp = p - vec2(5.0, -0.5);
      float gz = sqrt(max(0.0, 1.0 - dot(gp, gp) / 60.0));
      vec3 gn = normalize(vec3(gp * 0.09, gz));
      vec3 deep = mix(vec3(0.20, 0.45, 0.62), vec3(0.02, 0.05, 0.11), smoothstep(-3.0, 2.4, p.y));
      vec3 glass = deep * mix(vec3(1.0), glassTint * 1.6, 0.35);
      // The pilot, a dark shape in a helmet, seen through it.
      float head = chEllipse(p - vec2(4.4, -1.1), vec2(1.1, 1.2));
      float torso = chEllipse(p - vec2(4.1, 1.5), vec2(1.6, 1.9));
      float pilot = 1.0 - smoothstep(-0.1, 0.12, min(head, torso));
      glass = mix(glass, vec3(0.02, 0.03, 0.05), pilot * 0.88);
      glass += vec3(0.95, 0.98, 1.0) * (1.0 - smoothstep(-0.1, 0.1, head)) * 0.12;
      // Reflections: the sky and the horizon, and two streaks leaning across it.
      vec3 gr = chEnv(-0.18 + gn.y * 0.6 - 0.1 * (p.y + 0.5) / 4.0, gn.x, t);
      float fr = 0.12 + 0.7 * pow(1.0 - gn.z, 2.5);
      glass = mix(glass, gr * glassTint, fr * 0.55);
      float lean = p.x * 0.8 + p.y * 0.55;
      float s1 = smoothstep(0.55, 0.0, abs(lean - 3.4 - 0.7 * sin(t * 0.0007)));
      float s2 = smoothstep(0.22, 0.0, abs(lean - 5.0 - 0.7 * sin(t * 0.0007)));
      glass += vec3(1.0) * (s1 * 0.30 + s2 * 0.35) * smoothstep(0.0, 1.0, gz);
      // A dark frame round it, and a bright lip along its edge.
      glass *= 0.55 + 0.45 * smoothstep(0.0, 0.5, -dG);
      glass += vec3(0.8, 0.95, 1.0) * smoothstep(0.25, 0.0, abs(dG + 0.2)) * 0.25;
      col = chOver(vec4(glass * covG, covG), col);
    }
  }

  // --- the searchlight under the nose, a lens in a dark housing ---
  {
    float house = chEllipse(p - vec2(2.6, 7.3), vec2(1.7, 0.95));
    float cov = 1.0 - smoothstep(-aa, aa, house);
    float lens = 1.0 - smoothstep(-0.05, 0.1, chEllipse(p - vec2(2.6, 7.7), vec2(1.1, 0.4)));
    vec3 hc = vec3(0.16, 0.18, 0.22) + vec3(0.25) * smoothstep(0.4, -0.8, p.y - 7.3);
    hc = mix(hc, vec3(1.0, 0.97, 0.82) * 1.5, lens);
    col = chOver(vec4(hc * cov, cov), col);
    vec2 sd = p - vec2(2.6, 7.8);
    col.rgb += vec3(1.0, 0.95, 0.78) * exp(-dot(sd, sd) / 1.6) * 0.55;
  }

  // --- the mast and the rotor head ---
  {
    float mast = chCapsule(p, vec2(1.5, -5.6), vec2(1.5, -9.4), 0.85, 0.65);
    col = chOver(chMetal(mast, clamp((p.x - 1.5) / 0.8, -1.0, 1.0) * 0.8 - 0.2, aa, vec3(0.34, 0.37, 0.43)), col);
    float hub = chBox(p - CH_HUB - vec2(0.0, 0.1), vec2(1.5, 0.65), 0.45);
    col = chOver(chMetal(hub, clamp((p.y - CH_HUB.y) / 0.7, -1.0, 1.0), aa, vec3(0.42, 0.45, 0.52)), col);
  }

  // --- the tail rotor, turning face on over the fin ---
  {
    vec2 q = p - CH_TAIL_HUB;
    float r = length(q);
    float reach = 3.4;
    float spin = t * 0.06;
    // A faint blur of a disc, with the blades where they are and their ghosts behind.
    float disc = smoothstep(reach + 0.2, reach - 0.5, r);
    float blur = disc * (0.07 + 0.08 * snoise(vec2(atan(q.y, q.x) * 1.5 + spin * 0.5, r * 1.5)));
    float blades = 0.0;
    for (int k = 0; k < 3; k++) {
      float a = spin - float(k) * 0.32;
      vec2 dir = vec2(cos(a), sin(a));
      float along = dot(q, dir);
      float across = abs(q.x * dir.y - q.y * dir.x);
      float w = 0.32 - 0.1 * abs(along) / reach;
      float one = smoothstep(w + aa, w - aa, across) * smoothstep(reach + 0.1, reach - 0.1, abs(along));
      blades = max(blades, one * (k == 0 ? 0.9 : 0.4 / float(k)));
    }
    float ring = exp(-pow((r - reach) / 0.12, 2.0)) * 0.1;
    float a = clamp(blur + blades * 0.8, 0.0, 0.9);
    vec3 bc = mix(vec3(0.82, 0.88, 0.96), vec3(0.25, 0.28, 0.34), blades * 0.7);
    col = chOver(vec4(bc * a, a), col);
    col.rgb += vec3(0.8, 0.9, 1.0) * ring;
    float cap = 1.0 - smoothstep(-aa, aa, r - 0.55);
    col = chOver(vec4(vec3(0.5, 0.54, 0.6) * cap, cap), col);
  }

  // --- the main rotor: nearly edge on, a blurred disc with blades shimmering in it ---
  {
    const float R = 10.0;
    const float FLAT = 0.13;
    vec2 q = p - CH_HUB;
    vec2 qn = vec2(q.x / R, q.y / (R * FLAT));
    float rr = length(qn);
    float spin = t * 0.045;
    if (rr < 1.35) {
      float phi = atan(qn.y, qn.x);
      // The blur: a wedge trailing each of four blades, thinning out from the hub to the tips.
      float a = mod(phi - spin, 1.5707963) / 1.5707963;
      float trail = pow(1.0 - a, 2.6);
      float grain = 0.5 + 0.5 * snoise(vec2(rr * 5.0 - t * 0.0006, phi * 2.0 + spin * 2.0));
      float inDisc = smoothstep(1.02, 0.94, rr);
      float sheet = inDisc * (0.17 + 0.12 * smoothstep(0.0, 0.8, rr)) + inDisc * trail * (0.16 + 0.22 * grain) * smoothstep(0.05, 0.4, rr);
      // Shimmer: fine streaks along the blades' length that glint as they pass.
      float shim = inDisc * pow(0.5 + 0.5 * sin(rr * 46.0 - spin * 3.0 + phi * 3.0), 6.0) * 0.12 * (0.4 + 0.6 * trail);
      vec3 dc = mix(vec3(0.62, 0.70, 0.80), vec3(0.95, 0.98, 1.0), grain);
      float va = clamp(sheet + shim, 0.0, 0.7);
      vec4 disc = vec4(dc * va, va);
      // A few blades caught sharp, each in turn: a dark leading blade and its pale ghosts.
      float sharp = 0.0;
      float gloss = 0.0;
      for (int k = 0; k < 4; k++) {
        float th = spin - float(k) * 0.26;
        for (int s = 0; s < 2; s++) {
          float ang = th + float(s) * 3.1415927;
          vec2 tip = vec2(cos(ang) * R, sin(ang) * R * FLAT);
          float h = clamp(dot(q, tip) / dot(tip, tip), 0.0, 1.0);
          float d = length(q - tip * h);
          float w = mix(0.34, 0.22, h) + 0.05;
          float one = smoothstep(w + aa, w - aa, d) * smoothstep(0.02, 0.1, h);
          float fadeK = k == 0 ? 1.0 : exp(-float(k) * 0.85) * 0.7;
          sharp = max(sharp, one * fadeK);
          gloss = max(gloss, one * fadeK * step(0.0, sin(ang)));
        }
      }
      vec3 bladeC = mix(vec3(0.16, 0.18, 0.23), vec3(0.8, 0.88, 0.96), gloss * 0.7);
      disc = chOver(vec4(bladeC * sharp * 0.85, sharp * 0.85), disc);
      col = chOver(disc, col);
      // Tip vortex: a hot ring round the disc's edge and a bloom at each tip.
      float edge = exp(-pow((rr - 1.0) / 0.045, 2.0)) * (0.3 + 0.55 * trail);
      vec2 tq = (q - vec2(sign(q.x) * R, 0.0)) * vec2(1.0, 2.5);
      float tips = exp(-dot(tq, tq) / 1.6);
      col.rgb += vec3(0.65, 0.85, 1.0) * (edge * 0.55 + tips * (0.28 + 0.18 * sin(t * 0.02 + q.x)));
    }
    // The blade grips at the hub.
    float grip = 1.0 - smoothstep(-aa, aa, chBox(q, vec2(2.0, 0.4), 0.3));
    col = chOver(vec4(vec3(0.2, 0.22, 0.27) * grip, grip), col);
  }

  // --- lights with their bloom: red on the tail, green at the nose, a white strobe on the mast ---
  {
    float beat = sin(t * 0.00628318) > 0.0 ? 1.0 : 0.15;
    vec2 d1 = p - vec2(-14.9, -8.6);
    vec2 d2 = p - vec2(10.4, 1.5);
    vec2 d3 = p - vec2(1.5, -11.2);
    float ph = mod(t, 1500.0);
    float strobe = (ph < 60.0 || (ph > 240.0 && ph < 300.0)) ? 1.0 : 0.0;
    float c1 = smoothstep(0.55, 0.15, length(d1));
    float c2 = smoothstep(0.5, 0.12, length(d2));
    float c3 = smoothstep(0.55, 0.12, length(d3)) * (0.25 + 0.75 * strobe);
    vec3 lights = vec3(1.0, 0.18, 0.15) * (c1 * 1.4 + exp(-dot(d1, d1) / 3.0) * 0.9) * beat;
    lights += vec3(0.2, 1.0, 0.4) * (c2 * 1.2 + exp(-dot(d2, d2) / 2.2) * 0.7);
    lights += vec3(1.0) * (c3 * 1.6 + exp(-dot(d3, d3) / 6.0) * 1.3 * strobe);
    col.rgb += lights;
  }

  return col;
}
`;
