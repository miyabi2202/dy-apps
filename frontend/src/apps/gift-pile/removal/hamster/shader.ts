import type { Gfx, ShaderSource } from '../board';

// The hamster's face, drawn in GLSL through `Gfx.shade`: its round head and the cheek pouch
// that swells under it with every mouthful, into one furry ball. The `shade()` gets its position
// in px from the box's middle and returns a premultiplied colour; the prelude
// (`render/gl/shaders/prelude.ts`) supplies `smin`, `snoise` and `cover`.

/**
 * The head and its cheek pouch: two balls of fur melted into one, golden on top and creamy
 * underneath, softly lit from the top left, with a fringe of fur, a brown outline and, as the
 * pouch stretches tight, a shine on it and lumps where the icons are packed in.
 */
export const FACE_SHADER: ShaderSource = {
  key: 'hamster/face',
  glsl: `
// P: the head's middle (x, y) and radius, the pouch's radius. Q: the pouch's middle (x, y), how
// stuffed it is (0 to 1), a seed. color: the fur on top. All from the box's middle.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  vec2 hc = P.xy;
  float R = P.z;
  float C = max(P.w, 0.5);
  vec2 cc = Q.xy;
  float stuffed = Q.z;
  float seed = Q.w;
  // The pouch, lumpy with what is packed into it, melted into the head.
  vec2 pc = p - cc;
  vec2 dir = pc / max(length(pc), 1e-3);
  float lumps = snoise(dir * 1.7 + vec2(seed, seed * 0.37)) * 0.6
              + snoise(dir * 3.1 - vec2(seed * 0.5, seed)) * 0.4;
  float dc = length(pc) - C - lumps * C * 0.05 * stuffed;
  float dh = length(p - hc) - R;
  float d = smin(dh, dc, R * 0.9);
  // A fringe of fur round the edge, smoother where the pouch is stretched.
  d += snoise(p * 0.22 + seed) * (0.65 - 0.35 * stuffed);
  float a = cover(d);
  if (a <= 0.0) return vec4(0.0);
  // Round as a ball: a normal from whichever of the two the point is nearer.
  float w = smoothstep(-R * 0.5, R * 0.5, dc - dh);
  vec2 mid = mix(cc, hc, w);
  float rad = mix(C, R, w);
  vec2 nxy = clamp((p - mid) / (rad * 1.08), -1.0, 1.0);
  float nz = sqrt(max(0.0, 1.0 - dot(nxy, nxy)));
  vec3 n = normalize(vec3(nxy, nz + 0.2));
  vec3 L = normalize(vec3(-0.45, -0.7, 0.6));
  float diffuse = 0.82 + 0.18 * dot(n, L);
  // Golden on top, creamy underneath, the line between them soft and a little wavy.
  vec3 cream = mix(color, vec3(1.0, 0.97, 0.92), 0.88);
  float under = smoothstep(-0.05, 0.25, nxy.y + 0.06 * snoise(p * 0.12 + seed));
  vec3 rgb = mix(color, cream, under) * diffuse;
  // Darker towards the rim, as a ball of fur is.
  rgb *= 0.86 + 0.14 * smoothstep(0.0, 0.6, nz);
  // Stretched tight, the pouch shines: a small crisp highlight up on its top left.
  vec2 g = nxy - vec2(-0.38, -0.45);
  float shine = smoothstep(0.2, 0.05, length(g * vec2(1.0, 1.6))) * stuffed * (1.0 - w);
  rgb = mix(rgb, vec3(1.0), shine * 0.55);
  // The brown outline of a cartoon.
  float line = 1.0 - cover(d + max(1.5, v_px * 1.5));
  rgb = mix(rgb, color * 0.32, line * 0.9);
  return vec4(rgb * a, a);
}
`,
};

/** What the hamster compiles at startup. */
export const HAMSTER_SHADERS: readonly ShaderSource[] = [FACE_SHADER];

/** Where the head and pouch are and how big, in world pixels, for `drawFace`. */
export interface FaceShape {
  headX: number;
  headY: number;
  headR: number;
  pouchX: number;
  pouchY: number;
  pouchR: number;
  /** How stuffed it is, 0 to 1: how lumpy and shiny. */
  stuffed: number;
  seed: number;
}

/** The head and pouch, in fur of `color`. */
export function drawFace(gfx: Gfx, f: FaceShape, color: string): void {
  // A box round both, with room for the fringe and the outline.
  const left = Math.min(f.headX - f.headR, f.pouchX - f.pouchR) - 4;
  const right = Math.max(f.headX + f.headR, f.pouchX + f.pouchR) + 4;
  const top = Math.min(f.headY - f.headR, f.pouchY - f.pouchR) - 4;
  const bottom = Math.max(f.headY + f.headR, f.pouchY + f.pouchR) + 4;
  const x = (left + right) / 2;
  const y = (top + bottom) / 2;
  gfx.shade(
    FACE_SHADER,
    { x, y, halfW: (right - left) / 2, halfH: (bottom - top) / 2 },
    {
      p: [f.headX - x, f.headY - y, f.headR, f.pouchR],
      q: [f.pouchX - x, f.pouchY - y, f.stuffed, f.seed],
      color,
    },
  );
}
