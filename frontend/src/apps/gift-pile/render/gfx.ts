// What the removals draw with. They see only this interface, never the GL behind it
// (`gl/gl-gfx.ts`), so a test can hand them a fake. Everything is in world pixels, y down,
// angles in radians clockwise on screen (like `ctx.rotate`), and items are drawn in the order
// they are asked for, so layering is what the code says.

/** '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(…)', 'rgba(…)', or 0xRRGGBB; parsed once and cached. */
export type Color = string | number;
export type Blend = 'normal' | 'add';
/** How much the effects cost: `low` has no bloom, fewer particles, no pile sheen. */
export type Quality = 'high' | 'low';

/** Art to draw as a sprite: painted with Canvas2D once, or given as an image. */
export interface SpriteSource {
  /** Unique app-wide, e.g. 'balloon/2' or 'ufo/0'; textures are cached by it. */
  key: string;
  /** Size in world px the art is painted at (the texture is this × `BAKE_SCALE`). */
  width: number;
  height: number;
  /** Paint into a context `width`×`height` px, origin top-left. */
  paint?: (ctx: CanvasRenderingContext2D) => void;
  /** Or an image to draw to fill it; nothing is drawn while it is null. */
  image?: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null;
  /** Bake again every call (animated Canvas2D art); keep these small. */
  dynamic?: boolean;
}

/** A procedural drawing in GLSL that its owner hands `Gfx`, compiled once by `key` (see `Gfx.shade`). */
export interface ShaderSource {
  /** Unique app-wide, e.g. 'ufo/saucer'; the program is cached by it. */
  key: string;
  /**
   * GLSL ES 3.00 defining `vec4 shade(vec2 p, vec4 P, vec4 Q, vec3 color)`: the premultiplied
   * colour at `p`, the point's offset from the box's centre in the caller's units (x right, y
   * down, rotated with the box). `P` and `Q` are the `p` and `q` numbers of the draw, `color`
   * its colour. In scope: `u_time` (ms), `v_px` (caller units per device pixel, for
   * anti-aliasing), and the prelude: `TAU`, `hue`, `cover`, `over`, `snoise`, `hash12`,
   * `sdBox`, `sdEllipse`, `sdSegment`, `smin`, `Sky` and `envSky` (see
   * `render/gl/shaders/prelude.ts`).
   */
  glsl: string;
}

/** Where a shader draws: a box centred at (x, y), `halfW` × `halfH` to each side, turned by `rotation`. */
export interface ShadeBox {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  /** Radians clockwise on screen; default 0. */
  rotation?: number;
}

export interface ShadeOptions {
  /** Up to four numbers each, `P` and `Q` in the shader; missing ones are 0. */
  p?: ArrayLike<number>;
  q?: ArrayLike<number>;
  /** `color` in the shader; default white. */
  color?: Color;
  /** Multiplies the shader's whole output; default 1. */
  alpha?: number;
  /** Default 'normal' (premultiplied over); 'add' adds the output. */
  blend?: Blend;
}

/** Many boxes of one shader at once (stars, puffs); the arrays hold `count` entries each. */
export interface ShadeInstances {
  count: number;
  /** 2 per: box centre. */
  xy: Float32Array;
  /** 2 per: halfW, halfH. */
  half: Float32Array;
  /** 2 per: the unit vector of the box's x axis; default (1, 0) for all. */
  axis?: Float32Array;
  /** 4 per: `P`. */
  p: Float32Array;
  /** 4 per: `Q`; zeros if left out. */
  q?: Float32Array;
  /** 4 per: `color` rgb (straight, 0..1) and the alpha that multiplies the output. */
  rgba: Float32Array;
  blend?: Blend;
}

/** How to draw a sprite other than as it is. */
export type Material =
  /** The alpha mask filled with one colour (white-hot flash). */
  { kind: 'solid'; color: Color };

export interface SpriteOptions {
  x: number;
  y: number;
  /** Default: the source's size. */
  width?: number;
  height?: number;
  /** Which point of the sprite is at (x, y), 0 to 1 across it; default 0.5. */
  anchorX?: number;
  anchorY?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  flipX?: boolean;
  alpha?: number;
  tint?: Color;
  blend?: Blend;
  material?: Material;
}

export interface StrokeOptions {
  alpha?: number;
  blend?: Blend;
  cap?: 'round' | 'butt';
}

/** Dashes: `[on, off]` lengths, the pattern shifted by `dashOffset` as `ctx.lineDashOffset` does. */
export interface DashOptions {
  dash?: readonly [on: number, off: number];
  dashOffset?: number;
}

export interface FillOptions {
  alpha?: number;
  blend?: Blend;
  /** Also outline it (centred on the edge, as `ctx.stroke` does). */
  stroke?: { width: number; color: Color };
  /** Feather the edge over this many px. */
  soft?: number;
}

export interface ParticleData {
  count: number;
  /** 2 per particle, world px. (Particles ignore the transform stack.) */
  xy: Float32Array;
  /** Diameter, px. */
  size: Float32Array;
  /** 4 per particle, straight alpha 0..1. */
  rgba: Float32Array;
  rotation?: Float32Array;
  /** Built-in procedural shapes. */
  shape: 'disc' | 'spark' | 'ring' | 'star';
  blend?: Blend;
}

export interface Gfx {
  /** World time of this frame, ms. */
  readonly now: number;
  /** What the effects may cost this frame. */
  readonly quality: Quality;

  // --- transform stack: applied to everything emitted until the matching `pop` ---
  /** Translate to (x, y), rotate, then scale (uniformly). */
  push(x: number, y: number, rotation?: number, scale?: number): void;
  pop(): void;

  /** The gift icon, centred at (x, y), `scale` times its size: what `Board.stamp` draws. */
  icon(
    x: number,
    y: number,
    scale?: number,
    o?: {
      alpha?: number;
      rotation?: number;
      scaleX?: number;
      scaleY?: number;
      material?: Material;
      blend?: Blend;
    },
  ): void;

  sprite(src: SpriteSource, o: SpriteOptions): void;

  // --- shaders ---
  /**
   * Draw `src`'s `shade()` over a box. This is how a remover draws its own procedural art: it
   * hands over GLSL text (a `ShaderSource`) and numbers, and never touches GL.
   *
   * - Units: `box`, and the `p` in `shade`, are in the current transform's units (usually world
   *   px, y down). Size the box to hold everything the shader draws, glow and anti-aliasing
   *   margin included: nothing outside it is shaded.
   * - Numbers: `o.p` and `o.q` arrive as `P` and `Q` (four floats each) and `o.color` as
   *   `color`, all unchanged and in the caller's units, so no pre-scaling is needed. Use
   *   `v_px` for the width of an anti-aliased edge and `u_time` (ms, the frame's time) to
   *   animate.
   * - Output: premultiplied colour (`vec4(rgb * a, a)`; with 'add' blend only rgb matters).
   * - Order: drawn in call order with everything else, through the transform stack. A
   *   different `key` is a different program (a state change), so a run of one key is batched.
   * - A source that fails to compile is logged once and draws nothing. List a remover's
   *   sources in `Remover.shaders` so they are compiled at startup, not at first use; until
   *   one has compiled it draws nothing.
   */
  shade(src: ShaderSource, box: ShadeBox, o?: ShadeOptions): void;
  /** `shade` for many boxes of one source in one go (see `ShadeInstances`). */
  shadeMany(src: ShaderSource, data: ShadeInstances): void;

  // --- anti-aliased primitives ---
  circle(x: number, y: number, r: number, color: Color, o?: FillOptions): void;
  /** A circle's outline, `width` thick, centred on radius `r`. */
  ring(x: number, y: number, r: number, width: number, color: Color, o?: FillOptions): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    color: Color,
    o?: FillOptions,
  ): void;
  ellipseStroke(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    width: number,
    color: Color,
    o?: StrokeOptions & DashOptions,
  ): void;
  /** A pie slice: the disc from angle `from` round (clockwise on screen) to `to`, like `ctx.arc` joined to the centre. */
  wedge(
    x: number,
    y: number,
    r: number,
    from: number,
    to: number,
    color: Color,
    o?: FillOptions,
  ): void;
  /** A rectangle with its top left at (x, y), like `ctx.fillRect`; `rotation` is about its centre. */
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: Color,
    o?: FillOptions & { radius?: number; rotation?: number },
  ): void;
  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    color: Color,
    o?: StrokeOptions & DashOptions,
  ): void;
  /** `points` are x, y pairs. */
  polyline(
    points: ArrayLike<number>,
    width: number,
    color: Color,
    o?: StrokeOptions & DashOptions,
  ): void;
  /** Convex or star-shaped polygon (x, y pairs), fanned from its centroid. */
  polygon(points: ArrayLike<number>, color: Color, o?: FillOptions): void;
  /** A quad with a colour per corner (beams, cones, gradients); corners in order round it. */
  quad(
    xy: readonly [number, number, number, number, number, number, number, number],
    colors: readonly [Color, Color, Color, Color],
    o?: { blend?: Blend; alpha?: number },
  ): void;

  // --- effects ---
  /** A soft radial glow: full `intensity` out to `inner` (a share of `r`), fading to nothing at `r`. */
  glow(
    x: number,
    y: number,
    r: number,
    color: Color,
    o?: { intensity?: number; falloff?: number; inner?: number; blend?: Blend },
  ): void;
  // --- particles, trails and post effects ---
  /** Soft textured quads in one instanced draw (see `ParticleData`); `kit/particles.ts` makes the data. */
  particles(data: ParticleData): void;
  ribbon(
    points: ArrayLike<number>,
    width: number | ((u: number) => number),
    color: Color,
    o?: { blend?: Blend; alphaFrom?: number; alphaTo?: number },
  ): void;
  speedLines(
    cx: number,
    cy: number,
    o?: { count?: number; inner?: number; color?: Color; alpha?: number; seed?: number },
  ): void;
  /** Tint the whole view. */
  flash(color: Color, alpha: number): void;
  /** Post distortion ring (at most 4 a frame). */
  shockwave(x: number, y: number, radius: number, width: number, strength: number): void;
  /** Post gravitational pull (at most 1 a frame). */
  lens(x: number, y: number, radius: number, strength: number): void;
  /** Post heat shimmer over a rect (at most 2 a frame). */
  haze(x: number, y: number, w: number, h: number, strength: number): void;
  /** Post RGB split, 0 to 1 (the largest asked for wins). */
  aberration(strength: number): void;
}
