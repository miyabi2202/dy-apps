import type { Blend, Color, Gfx, ShadeInstances, ShaderSource } from '../board';

// The fireworks, drawn entirely in GLSL through `Gfx.shade` / `shadeMany`. Each source's
// `shade()` gets its position in px from the box's middle and returns a premultiplied colour; all
// but the smoke are added to the picture, and run brighter than 1 on purpose, for the bloom.

/**
 * One star of a burst, a glowing head with a streak behind it along -x (`P.x` px long, its
 * head at +L/2 from the middle), `P.y` px across at its core. It goes white-hot at birth, takes its
 * colour, then cools towards an ember as it dies (`P.z` is 0 at birth, 1 at death, `P.w` the
 * seed); `Q.x` is its gain, `Q.y` (0 or 1) makes it a long golden drip.
 */
export const SPARK_SHADER: ShaderSource = {
  key: 'fireworks/star',
  glsl: `
float fwHash(float n) {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 col) {
  float L = P.x, r = P.y, u = P.z, seed = P.w, gain = Q.x, willow = Q.y, t = u_time;
  vec2 q = p - vec2(L * 0.5, 0.0);
  // The distance to the streak, a segment from the head back along -x, and how far along it is.
  float along = clamp(-q.x / max(L, 0.001), 0.0, 1.0);
  vec2 s = vec2(q.x - clamp(q.x, -L, 0.0), q.y);
  float d = length(s);
  // Thick at the head and thin at the tail; a willow keeps its width.
  float w = r * mix(1.0, mix(0.2, 0.55, willow), along);
  float body = exp(-d * d / (w * w)) * pow(1.0 - along, mix(1.4, 0.8, willow));
  float halo = exp(-d * d / (w * w * 5.0)) * 0.22 * (1.0 - along * 0.7);
  float head = exp(-dot(q, q) / (r * r * 1.1));
  // Colour over its life: white-hot, its own colour, then an ember.
  vec3 hot = vec3(1.0, 0.97, 0.9);
  vec3 c = mix(hot, col, smoothstep(0.0, 0.22, u));
  vec3 ember = mix(col, vec3(1.0, 0.42, 0.12), 0.65) * 0.8;
  c = mix(c, ember, smoothstep(0.5, 1.0, u));
  // The tail is the colour of an older star: it cools along the streak.
  vec3 tail = mix(c, ember, along * 0.7);
  // Crackle: it flickers, harder as it dies, and winks out in the last of its life.
  float tick = floor(t * 0.03 + seed * 40.0);
  float blink = fwHash(tick + seed * 9.0);
  float strobe = mix(1.0, step(0.35, blink) * (0.5 + blink), smoothstep(0.35, 0.85, u) * (1.0 - willow * 0.6));
  float flick = 0.8 + 0.2 * sin(t * 0.05 + seed * 30.0);
  float fade = (1.0 - smoothstep(0.6, 1.0, u));
  float I = (body + halo) * strobe * flick * fade;
  vec3 rgb = tail * I * gain + hot * head * strobe * fade * gain * 0.9;
  float a = clamp(I + head * 0.5, 0.0, 1.0);
  return vec4(rgb, a);
}
`,
};

/**
 * A tiny four-point star that strobes: the crackle of a burst and the sparks that fall off a
 * rocket's tail. `P` is reach in px, life (0 to 1), seed, gain.
 */
export const GLITTER_SHADER: ShaderSource = {
  key: 'fireworks/glitter',
  glsl: `
float fwHash(float n) {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 col) {
  float R = P.x, u = P.y, seed = P.z, gain = P.w, t = u_time;
  // Two crossed lines, brightest at the middle, turned a little per star.
  float ang = seed * TAU;
  p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
  float rr = length(p);
  float lines = exp(-abs(p.x * p.y) / (R * R * 0.012)) * smoothstep(R, 0.0, rr);
  float core = exp(-rr * rr / (R * R * 0.025));
  float tick = floor(t * 0.045 + seed * 50.0);
  float blink = fwHash(tick + seed * 7.0);
  float strobe = step(0.3, blink) * (0.4 + blink);
  float fade = 1.0 - smoothstep(0.55, 1.0, u);
  vec3 c = mix(vec3(1.0, 0.97, 0.88), col, smoothstep(0.0, 0.5, u));
  float I = (lines * 0.8 + core * 1.2) * strobe * fade;
  return vec4(c * I * gain, clamp(I, 0.0, 1.0));
}
`,
};

/**
 * The heart of a burst the moment it goes off: a white-hot core, jagged rays of light, and a
 * thin ring of the burst's colour racing out. `P` is reach in px, life (0 at the flash, 1 when
 * it has died), seed.
 */
export const FLASH_SHADER: ShaderSource = {
  key: 'fireworks/flash',
  glsl: `
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 col) {
  float R = P.x, u = P.y, seed = P.z, t = u_time;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float fade = pow(1.0 - u, 2.0);
  float snap = 1.0 - pow(1.0 - clamp(u * 1.6, 0.0, 1.0), 3.0);
  // The core: very hot at the middle, shrinking as it cools.
  float coreR = R * mix(0.2, 0.08, u);
  float core = exp(-r * r / (coreR * coreR));
  float bloom = exp(-r / (R * 0.16)) * 0.3;
  // Rays: lumps of noise round the circle, so no two flashes are the same.
  float rays = snoise(vec2(ang * 2.2 + seed * 13.0, seed * 5.0 + t * 0.0008)) * 0.5 + 0.5;
  rays = pow(rays, 2.4) + pow(snoise(vec2(ang * 5.0, seed * 11.0)) * 0.5 + 0.5, 4.0) * 0.6;
  float reach = R * mix(0.35, 1.0, snap);
  rays *= exp(-r / (reach * 0.42)) * (1.0 - smoothstep(reach * 0.7, reach, r));
  // The ring of air, on the front of it.
  float ringR = R * 0.95 * snap;
  float ring = exp(-pow((r - ringR) / (R * 0.03 + 1.0), 2.0)) * (1.0 - u) * 0.8;
  vec3 hot = vec3(1.0, 0.98, 0.92);
  vec3 c = hot * (core * 1.8 + bloom) + mix(col, hot, 0.35) * (rays * 1.1 + ring * 1.1 + bloom * 0.8);
  c *= fade;
  return vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
}
`,
};

/**
 * A puff of smoke eaten into by noise and lit from inside by the burst's colour, which fades as
 * the sparks do. Premultiplied, for the normal blend. `P` is radius in px, life, seed, light (0 to 1).
 */
export const SMOKE_SHADER: ShaderSource = {
  key: 'fireworks/smoke',
  glsl: `
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 col) {
  float R = P.x, u = P.y, seed = P.z, lit = P.w;
  vec2 q = p / R;
  float d = length(q);
  // The puff churns slowly as it drifts out, and its edge is torn by finer noise.
  vec2 at = q * 1.7 + vec2(seed * 17.0, seed * 9.0) + vec2(0.0, -u * 0.8);
  float n = snoise(at) * 0.55 + snoise(at * 2.3 + 4.0) * 0.3 + snoise(at * 5.1 - 2.0) * 0.15;
  float body = smoothstep(1.0, 0.15, d + n * 0.42) * smoothstep(1.4, 1.0, d);
  float a = body * 0.4 * (1.0 - smoothstep(0.5, 1.0, u)) * smoothstep(0.0, 0.08, u);
  // Grey-blue smoke, shaded towards its bottom, and lit more on the side towards the burst.
  vec3 smoke = mix(vec3(0.46, 0.5, 0.58), vec3(0.15, 0.17, 0.24), clamp(q.y * 0.5 + 0.5 - n * 0.2, 0.0, 1.0));
  float inner = exp(-d * 1.6) * (0.6 + 0.4 * n);
  vec3 glow = col * lit * (0.35 + 1.5 * inner);
  return vec4((smoke * 0.55 + glow) * a, a);
}
`,
};

/**
 * A rocket going up: a white-hot head in a halo of its colour, and a sparkling fuse behind it
 * along -x (`P.x` px long, the head at +L/2 from the middle) that flickers with noise and sheds
 * little stars. `P` is length, head radius in px, seed.
 */
export const ROCKET_SHADER: ShaderSource = {
  key: 'fireworks/rocket',
  glsl: `
float fwHash(float n) {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 col) {
  float L = P.x, r = P.y, seed = P.z, t = u_time;
  vec2 q = p - vec2(L * 0.5, 0.0);
  float along = clamp(-q.x / max(L, 0.001), 0.0, 1.0);
  vec2 s = vec2(q.x - clamp(q.x, -L, 0.0), q.y);
  float d = length(s);
  // The fuse burns unevenly: noise along it widens and narrows it and dims it in patches.
  float n = snoise(vec2(q.x * 0.09 + t * 0.012 + seed * 20.0, q.y * 0.18 + seed));
  float flick = 0.65 + 0.55 * n;
  float w = r * mix(0.85, 0.25, along) * (0.8 + 0.4 * n);
  float fuse = exp(-d * d / (w * w)) * pow(1.0 - along, 1.3) * flick;
  float haze = exp(-d * d / (w * w * 14.0)) * 0.4 * pow(1.0 - along, 1.8);
  float qr = length(q);
  float core = exp(-qr * qr / (r * r * 0.9));
  float halo = exp(-qr * qr / (r * r * 5.0)) * 0.75;
  // Sparks thrown off the fuse: a grid of cells along it, each with a star that drifts back
  // and across and winks.
  float spark = 0.0;
  float cell = 7.0;
  float k0 = floor(-q.x / cell);
  for (int i = 0; i < 3; i++) {
    float k = k0 - float(i);
    float h = fwHash(k * 1.7 + seed * 31.0);
    float h2 = fwHash(k * 3.1 + seed * 17.0);
    float life = fract(t * 0.0045 + h);
    vec2 at = vec2(-(k + 0.5) * cell + life * 6.0, 0.0);
    at.y = (h2 - 0.5) * 2.0 * r * 1.6 + (life * (h2 - 0.5)) * 16.0;
    float dd = length(q - at);
    float wink = step(0.4, fwHash(floor(t * 0.04 + h * 20.0)));
    float on = step(0.45, h) * (1.0 - life) * wink * step(0.0, k);
    spark += exp(-dd * dd / (r * r * 0.07 + 0.5)) * on;
  }
  vec3 hot = vec3(1.0, 0.97, 0.85);
  vec3 gold = vec3(1.0, 0.87, 0.35);
  vec3 trail = mix(mix(hot, gold, smoothstep(0.0, 0.25, along)), col, smoothstep(0.15, 0.8, along));
  vec3 c = trail * (fuse * 2.4 + haze) + hot * core * 3.0 + mix(col, hot, 0.3) * halo + mix(gold, hot, 0.5) * spark * 2.0;
  return vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
}
`,
};

export const FIREWORKS_SHADERS: readonly ShaderSource[] = [
  SPARK_SHADER,
  GLITTER_SHADER,
  FLASH_SHADER,
  SMOKE_SHADER,
  ROCKET_SHADER,
];

/** A star's core is this share of its size across (a drip's, the second). */
export const STAR_CORE = 0.3;
export const DRIP_CORE = 0.24;
/** Streak length is `speed * this`, kept between `size * 0.5` and `size * MAX`. */
export const STAR_STREAK = 0.13;
export const DRIP_STREAK = 0.2;
export const STAR_STREAK_MAX = 6;
export const DRIP_STREAK_MAX = 8;
/** Glitter reaches this share of its size. */
export const GLITTER_REACH = 0.9;
/** Smoke's box reaches this many radii from its middle. */
export const SMOKE_BOX = 1.4;

/** The flash of a burst going off at (x, y), reaching `reach` px; `life` is 0 as it goes off and 1 when it has died. */
export function drawFlash(
  gfx: Gfx,
  x: number,
  y: number,
  reach: number,
  life: number,
  color: Color,
  seed: number,
): void {
  if (life >= 1) return;
  gfx.shade(
    FLASH_SHADER,
    { x, y, halfW: reach, halfH: reach },
    { p: [reach, life, seed, 0], color, blend: 'add' },
  );
}

/** A rocket's head at (x, y) in a halo of `color`, with its fuse back to (tailX, tailY). */
export function drawRocket(
  gfx: Gfx,
  x: number,
  y: number,
  tailX: number,
  tailY: number,
  radius: number,
  color: Color,
  seed: number,
): void {
  const dx = x - tailX;
  const dy = y - tailY;
  const dist = Math.hypot(dx, dy);
  const length = Math.max(dist, radius);
  const ex = dist > 1e-3 ? dx / dist : 0;
  const ey = dist > 1e-3 ? dy / dist : -1;
  const pad = radius * 5;
  gfx.shade(
    ROCKET_SHADER,
    {
      x: x - (ex * length) / 2,
      y: y - (ey * length) / 2,
      halfW: length / 2 + pad,
      halfH: pad,
      rotation: Math.atan2(ey, ex),
    },
    { p: [length, radius, seed, 0], color, blend: 'add' },
  );
}

/** Per-instance buffers for one `shadeMany` call, sized for `capacity`. */
export type InstanceBuffer = Required<Omit<ShadeInstances, 'blend'>> & { blend: Blend };

export function instanceBuffer(capacity: number, blend: Blend): InstanceBuffer {
  return {
    count: 0,
    xy: new Float32Array(capacity * 2),
    half: new Float32Array(capacity * 2),
    axis: new Float32Array(capacity * 2),
    p: new Float32Array(capacity * 4),
    q: new Float32Array(capacity * 4),
    rgba: new Float32Array(capacity * 4),
    blend,
  };
}
