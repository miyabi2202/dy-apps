import type { Gfx, ShaderSource } from '../board';

// The hamster's round body, drawn in GLSL through `Gfx.shade`: one soft ball of fur that is its
// head and body together, its ears on top and the two cheek pouches either side of its face that
// swell with every mouthful. The `shade()` gets its position in px from the box's middle (the
// ball's middle) and returns a premultiplied colour; the prelude (`render/gl/shaders/prelude.ts`)
// supplies `smin`, `sdEllipse` and `cover`.

/**
 * The ball: golden on top and creamy-white on its belly, muzzle and under its cheeks, softly lit
 * from the top left, with round ears with pink insides, a thin warm outline and, as the pouches
 * stretch tight, a shine on each. It works facing right and unsquashed, so it first undoes the
 * squash and the mirroring it is drawn with.
 */
export const BALL_SHADER: ShaderSource = {
  key: 'hamster/ball',
  glsl: `
// P: the ball's radii (x, y), its face's middle across it, and which way it faces (the sign)
// times how squashed it is. Q: the pouches' radius, how far each is from the face's middle, how
// far down they are, and how stuffed they are (0 to 1). color: the fur on top. The face is a
// quarter of the ball's height up from its middle.
vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  vec2 r = P.xy;
  float fx = P.z;
  float sq = max(abs(P.w), 0.1);
  float dir = P.w < 0.0 ? -1.0 : 1.0;
  float cr = Q.x;
  float cdx = Q.y;
  float cy = Q.z;
  float stuffed = Q.w;
  vec2 q = vec2(p.x * dir * sq, p.y / sq);
  float fy = -0.25 * r.y;
  float lw = max(0.75, v_px * 1.4);
  vec3 cream = vec3(1.0, 0.955, 0.89);
  vec3 line = color * vec3(0.74, 0.62, 0.56);

  // The ball and its pouches, melted into one.
  float db = sdEllipse(q, r);
  vec2 c1 = vec2(fx - cdx, cy);
  vec2 c2 = vec2(fx + cdx, cy);
  float dc = min(length(q - c1), length(q - c2)) - cr;
  float d = smin(db, dc, 1.5 + 0.12 * cr);

  // Its ears, round, peeking over the top behind it.
  float er = 3.6 + 0.12 * r.x;
  vec2 e1 = vec2(fx * 0.5 - r.x * 0.56, -r.y * 0.8);
  vec2 e2 = vec2(fx * 0.5 + r.x * 0.56, -r.y * 0.8);
  vec2 eq = q - (length(q - e1) < length(q - e2) ? e1 : e2);
  float de = length(eq) - er;
  float di = length(eq - vec2(0.0, -er * 0.12)) - er * 0.58;
  vec4 ear = vec4(0.0);
  float ea = cover(de);
  if (ea > 0.0) {
    vec3 ec = mix(color * 0.97, vec3(1.0, 0.68, 0.73), cover(di, er * 0.15));
    ec = mix(ec, line, 1.0 - cover(de + lw));
    ear = vec4(ec * ea, ea);
  }

  float a = cover(d);
  if (a <= 0.0) return ear;

  // Creamy white on its belly, round its muzzle and under its cheeks; golden on top.
  float belly = sdEllipse(q - vec2(fx * 0.4, r.y * 0.62), vec2(r.x * 0.64, r.y * 0.52));
  float muzzle = sdEllipse(q - vec2(fx, fy + 4.6), vec2(4.2 + 0.12 * cdx, 3.4 + 0.06 * r.y));
  vec2 inCheek = vec2(abs(q.x - fx) - cdx, q.y - cy) / max(cr, 1.0);
  float under = smoothstep(-0.05, 0.55, inCheek.y) * (1.0 - smoothstep(0.9, 1.1, length(inCheek)));
  float white = max(max(cover(belly, 2.5), cover(muzzle, 1.6)), under * smoothstep(0.0, 6.0, cr));
  vec3 rgb = mix(color, cream, white);

  // Round as a ball: lit from the top left, a little darker towards its rim and underneath.
  vec2 n = q / (r * 1.05);
  vec2 nc = (q - (q.x < fx ? c1 : c2)) / max(cr, 1.0);
  float w = smoothstep(-2.0, 2.0, db - dc);
  vec2 nxy = clamp(mix(n, nc, w), -1.0, 1.0);
  float nz = sqrt(max(0.0, 1.0 - dot(nxy, nxy)));
  float light = 0.9 + 0.1 * dot(normalize(vec3(nxy, nz + 0.3)), normalize(vec3(-0.4, -0.65, 0.65)));
  rgb *= light * (0.94 + 0.06 * smoothstep(0.0, 0.5, nz));
  // A soft sheen up on its crown.
  float crown = smoothstep(0.55, 0.0, length((n - vec2(-0.3, -0.55)) * vec2(1.0, 1.8)));
  rgb = mix(rgb, vec3(1.0, 0.97, 0.9), crown * 0.16);
  // Stretched tight, each pouch shines: a small crisp highlight on its top.
  vec2 g = nc - vec2(-0.25, -0.55);
  float shine = smoothstep(0.3, 0.12, length(g * vec2(1.0, 1.7))) * stuffed * w;
  rgb = mix(rgb, vec3(1.0), shine * 0.6);

  // The thin, warm outline of a sticker.
  rgb = mix(rgb, line, 1.0 - cover(d + lw));
  return over(vec4(rgb * a, a), ear);
}
`,
};

/** What the hamster compiles at startup. */
export const HAMSTER_SHADERS: readonly ShaderSource[] = [BALL_SHADER];

/** The ball's shape, in its own frame from its middle, facing right and unsquashed, for `drawBall`. */
export interface BallShape {
  rx: number;
  ry: number;
  /** The face's middle across it. */
  faceX: number;
  /** The pouches' radius, how far each is from the face's middle, and how far down they are. */
  cheekR: number;
  cheekDX: number;
  cheekY: number;
  /** How stuffed they are, 0 to 1: how shiny. */
  stuffed: number;
}

/** The ball with its middle at (x, y) in the current transform, facing `dir`, squashed by `squash`, in fur of `color`. */
export function drawBall(
  gfx: Gfx,
  x: number,
  y: number,
  dir: number,
  squash: number,
  b: BallShape,
  color: string,
): void {
  // A box round all of it, with room for the ears and the outline.
  const reach = Math.max(b.rx, Math.abs(b.faceX) + b.cheekDX + b.cheekR) + 3;
  const down = Math.max(b.ry, b.cheekY + b.cheekR) + 3;
  const up = b.ry + 3.6 + 0.12 * b.rx + 3;
  const half = Math.max(down, up);
  gfx.shade(
    BALL_SHADER,
    { x, y, halfW: reach / squash, halfH: half * squash },
    {
      p: [b.rx, b.ry, b.faceX, (dir < 0 ? -1 : 1) * squash],
      q: [b.cheekR, b.cheekDX, b.cheekY, b.stuffed],
      color,
    },
  );
}
