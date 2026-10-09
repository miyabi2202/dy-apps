import type { Gfx, ShaderSource } from '../board';
import { parseColor } from '../../render/color';

// The subway car's body, drawn in GLSL through `Gfx.shade`, in two passes over the same box: the
// far side of the car (lit walls, straps, the windows across), seen only through the windows and
// the open door, and then the body itself, with glass in the windows that lets the squashed
// passengers drawn between the passes show. Everything is in the car's own units (see
// `train.ts`): a car 320 long, its origin in the middle of its side, y down. The prelude supplies
// `sdBox`, `sdSegment`, `hash12` and `cover`.

/**
 * The car: P is how far open the doors are (0 to 1), how far the body bulges, the pass (0 the
 * far side, 1 the body) and the door lamp (0 to 1); Q is the accent colour and how far the car
 * has run, which slides the glass's reflections along; `color` is the line's.
 */
export const CAR_SHADER: ShaderSource = {
  key: 'subway/car',
  glsl: `
const vec2 WINDOWS[6] = vec2[6](
  vec2(-145.0, 10.0), vec2(-108.0, 20.0), vec2(-56.0, 20.0),
  vec2(56.0, 20.0), vec2(108.0, 20.0), vec2(145.0, 10.0)
);

float sdRound(vec2 p, vec2 b, float r) {
  return sdBox(p, b - r) - r;
}

// The windows along the side, all from y -34 to -6.
float windows(vec2 q) {
  float d = 1e5;
  for (int i = 0; i < 6; i++) {
    d = min(d, sdRound(q - vec2(WINDOWS[i].x, -20.0), vec2(WINDOWS[i].y, 14.0), 3.5));
  }
  return d;
}

// The far wall, as seen through the glass: warm and lit, with the windows across the car, a
// strip light, the grab rail and its straps, and the floor.
vec3 farSide(vec2 q) {
  vec3 wall = mix(vec3(1.0, 0.95, 0.82), vec3(0.82, 0.76, 0.64), smoothstep(-40.0, 18.0, q.y));
  float across = sdRound(vec2(mod(q.x + 26.0, 52.0) - 26.0, q.y + 21.0), vec2(17.0, 10.0), 3.0);
  wall = mix(wall, vec3(0.66, 0.82, 0.96), cover(across) * 0.85);
  wall += vec3(1.0, 0.97, 0.88) * exp(-pow((q.y + 38.5) / 2.2, 2.0)) * 0.7;
  float rail = abs(q.y + 31.0) - 0.7;
  float sx = mod(q.x, 11.0) - 5.5;
  float strap = sdSegment(vec2(sx, q.y), vec2(0.0, -31.0), vec2(0.0, -26.0)) - 0.55;
  float ring = abs(length(vec2(sx, q.y + 23.6)) - 2.3) - 0.55;
  wall = mix(wall, vec3(0.55, 0.58, 0.62), cover(rail));
  wall = mix(wall, vec3(0.92, 0.92, 0.9), cover(min(strap, ring)));
  wall = mix(wall, vec3(0.42, 0.38, 0.36), smoothstep(13.5, 14.5, q.y));
  return wall;
}

vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color) {
  float open = clamp(P.x, 0.0, 1.0);
  float bulge = P.y;
  // The box is centred 6 above the car's origin.
  p.y -= 6.0;
  // Undo the bulge: q is where p would be on the car at rest.
  float u = p.x / 170.0;
  float bow = max(0.0, 1.0 - u * u);
  vec2 q = vec2(p.x, (p.y + 6.0) / (1.0 + bulge * bow) - 6.0);

  float body = sdRound(q - vec2(0.0, -6.0), vec2(160.0, 46.0), 14.0);
  // The air-conditioning units on the roof are part of it.
  vec2 rq = vec2(abs(q.x) - 44.0, q.y + 53.0);
  body = min(body, sdRound(rq, vec2(24.0, 5.0), 2.5));
  float doorway = sdBox(q - vec2(0.0, -9.0), vec2(19.0, 31.0));
  float gap = 19.0 * open;
  // The open part of the doorway, the leaves either side of it, and the windows in the leaves.
  float hole = max(doorway, abs(q.x) - gap);
  float leaves = max(doorway, gap - abs(q.x));
  float leafWin = max(sdRound(vec2(abs(q.x) - (9.5 + gap), q.y + 22.0), vec2(5.0, 11.0), 2.5), leaves);
  float win = windows(q);
  float through = min(min(win, hole), leafWin);

  if (P.z < 0.5) {
    // The far side, wherever the car can be seen through.
    float a = cover(through) * cover(body);
    return vec4(farSide(q) * a, a);
  }

  // Steel: lighter towards the roof, brushed, ribbed below the band, rounded at the edges.
  float v = clamp((q.y + 52.0) / 92.0, 0.0, 1.0);
  vec3 col = mix(vec3(0.95, 0.96, 0.98), vec3(0.63, 0.67, 0.73), v);
  col *= 0.965 + 0.035 * hash12(vec2(floor(q.x * 2.0), floor(q.y * 0.4)));
  if (q.y > 13.0) col *= 0.95 + 0.05 * sin(q.x * 1.7);
  col += vec3(0.18) * exp(-pow((q.y + 44.0) / 3.5, 2.0));
  // The roof, darker, with its units.
  col = mix(col, vec3(0.55, 0.58, 0.63), smoothstep(-45.5, -47.5, q.y));
  // The seams between the panels.
  float seam = min(min(abs(abs(q.x) - 32.0), abs(abs(q.x) - 82.0)), abs(abs(q.x) - 130.0));
  col *= 1.0 - 0.22 * cover(seam - 0.35) * step(-46.0, q.y);
  // The line's band under the windows, its accent under that, and a thin line over the windows.
  vec3 band = color * (1.05 - 0.25 * smoothstep(0.0, 9.0, q.y));
  col = mix(col, band, cover(abs(q.y - 4.5) - 4.5));
  col = mix(col, Q.rgb, cover(abs(q.y - 10.8) - 0.9));
  col = mix(col, color, cover(abs(q.y + 41.5) - 1.2));
  // The headlamp at the front and the tail lamp at the back.
  float headlamp = length((q - vec2(152.0, 16.0)) * vec2(1.0, 1.6)) - 3.6;
  col = mix(col, vec3(1.0, 0.97, 0.82), cover(headlamp));
  float tail = length((q - vec2(-152.0, 16.0)) * vec2(1.0, 1.6)) - 3.0;
  col = mix(col, vec3(0.85, 0.08, 0.08), cover(tail));
  // Darker towards the edges, so the body reads as rounded.
  col *= 0.72 + 0.28 * smoothstep(0.0, 7.0, -body);

  // The door leaves: brighter steel with a sheen down each, the line's colour across them, a dark
  // outline, and a thick black rubber edge where they meet.
  vec3 leaf = mix(vec3(0.97, 0.98, 1.0), vec3(0.72, 0.75, 0.8), v);
  leaf += vec3(0.12) * exp(-pow((abs(q.x) - gap - 5.0) / 2.0, 2.0));
  leaf = mix(leaf, color, cover(abs(q.y - 4.5) - 2.5));
  col = mix(col, leaf, cover(leaves));
  col = mix(col, vec3(0.3, 0.32, 0.36), cover(abs(leaves) - 0.5));
  col = mix(col, vec3(0.13, 0.14, 0.16), cover(abs(doorway) - 1.8));
  col = mix(col, vec3(0.05, 0.05, 0.06), cover(max(abs(abs(q.x) - gap - 0.9) - 1.1, doorway)));
  // The yellow edge on the threshold.
  col = mix(col, vec3(0.98, 0.8, 0.12), cover(max(abs(q.y - 21.0) - 1.0, abs(q.x) - 19.0)));
  // The lamp over the door.
  float lamp = length(q - vec2(0.0, -45.0)) - 2.3;
  col = mix(col, mix(vec3(0.35, 0.05, 0.05), vec3(1.0, 0.25, 0.2), P.w), cover(lamp));
  col += vec3(1.0, 0.2, 0.15) * P.w * 0.5 * exp(-pow(length(q - vec2(0.0, -45.0)) / 5.0, 2.0));

  // Black rubber round each window, and the glass: a faint tint and sliding streaks of reflection.
  float glass = min(win, leafWin);
  col = mix(col, vec3(0.1, 0.11, 0.13), cover(abs(glass) - 1.2));
  float a = cover(body);
  float s = fract((q.x - q.y * 0.7 + Q.w) * 0.018);
  float streak = smoothstep(0.1, 0.0, abs(s - 0.3)) + 0.6 * smoothstep(0.05, 0.0, abs(s - 0.45));
  float g = cover(glass + 1.2);
  vec3 glassCol = mix(vec3(0.75, 0.86, 0.95), vec3(1.0), streak);
  float glassA = 0.12 + 0.3 * streak + 0.1 * smoothstep(-20.0, -34.0, q.y);
  col = mix(col, glassCol, g);
  a = mix(a, glassA * cover(body), g);
  // The open doorway in shadow, so what is in it reads as inside the car.
  float shadow = cover(hole) * cover(body);
  col = mix(col, vec3(0.02, 0.02, 0.04), shadow);
  a = mix(a, mix(0.42, 0.18, smoothstep(-40.0, 22.0, q.y)), shadow);
  return vec4(col * a, a);
}
`,
};

/** What the subway remover compiles at startup. */
export const SUBWAY_SHADERS: readonly ShaderSource[] = [CAR_SHADER];

/** How the car's body is to be painted. */
export interface CarPaint {
  open: number;
  bulge: number;
  lamp: number;
  run: number;
  scale: number;
  livery: { line: string; accent: string };
}

/** One pass of the car (0 the far side, 1 the body), in the car's units, with its origin where the transform puts it. */
export function drawCar(gfx: Gfx, car: CarPaint, pass: 0 | 1): void {
  const [r, g, b] = parseColor(car.livery.accent);
  gfx.shade(
    CAR_SHADER,
    // Room for the roof units and the bulge.
    { x: 0, y: -6, halfW: 168, halfH: 66 * (1 + car.bulge) },
    {
      p: [car.open, car.bulge, pass, car.lamp],
      q: [r, g, b, car.run / car.scale],
      color: car.livery.line,
    },
  );
}
