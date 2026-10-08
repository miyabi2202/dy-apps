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

export type Material =
  /** Rainbow sheen band sweeping with time. */
  | { kind: 'holo'; angle?: number; strength?: number }
  /** Specular streak and a darker lower half. */
  | { kind: 'metal'; strength?: number }
  /** Rim light from the alpha edge. */
  | { kind: 'rim'; color: Color; width?: number }
  /** The alpha mask filled with one colour (white-hot flash). */
  | { kind: 'solid'; color: Color };

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
  /**
   * Scroll the texture by this much of its size, wrapping round (for a texture made to tile,
   * like the scanlines of a beam). Ignored with a material.
   */
  uvOffset?: readonly [number, number];
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
  /**
   * A procedural black hole: horizon, photon ring and a banded, Doppler-lit accretion disk.
   * `r` is the horizon's radius when fully `open` (0 to 1, which also scales it and its light);
   * the disk reaches about 3.5 times as far. `glow` tints its outer light, `disk` the disk.
   */
  blackHole(
    x: number,
    y: number,
    r: number,
    open: number,
    colors: { glow: Color; disk: Color },
  ): void;
  /**
   * A procedural flying saucer, `width` across, centred at (x, y) and tipped by `tilt`: a chrome
   * hull with a seam, a ring of chasing lights and an emitter underneath, and a glass dome with
   * swirling energy. `hull` tints the metal, `dome` the energy, `lights` the lights and emitter;
   * `glow` (default 1) scales how much they shine. It animates with the frame's time.
   */
  saucer(
    x: number,
    y: number,
    width: number,
    o: { hull: Color; dome: Color; lights: Color; tilt?: number; glow?: number; alpha?: number },
  ): void;
  /**
   * A procedural plasma beam, additive: from a top edge `topWidth` wide at (topX, topY) down to
   * `bottomY`, `bottomWidth` wide there, with rippling edges, bands of energy climbing it, a hot
   * core, sparkles, and a pool of light at its foot. `intensity` (default 1) 0 to 1 fades it.
   */
  plasmaBeam(
    topX: number,
    topY: number,
    topWidth: number,
    bottomY: number,
    bottomWidth: number,
    o: { color: Color; intensity?: number },
  ): void;
  // Helicopter
  /**
   * A procedural rescue helicopter facing right, its cabin's middle at (x, y), `unit` px to a
   * unit of its drawing (the cabin is about 22 units long): glossy paint in `body` with a stripe
   * in `stripe`, tinted cockpit glass (`glass`, default a sky blue), skids, a searchlight, a
   * main rotor blurred into a disc and a turning tail rotor, and blinking lights with bloom. `time`
   * (ms) turns the rotors and blinks the lights.
   */
  chopper(
    x: number,
    y: number,
    unit: number,
    o: { body: Color; stripe: Color; glass?: Color; time: number; alpha?: number },
  ): void;
  // Hypercar
  /**
   * A procedural supercar facing right, `length` long, centred at (x, y) and tipped by `tilt`
   * (its wheels reach `length * 3/16` below the centre): car paint with flake, a clear coat
   * and a sweeping highlight, a glass canopy, LED lamps, a wing, neon underglow and spinning
   * wheels. `body` is the paint, `trim` the wing's carbon, `neon` the glow and accents. `spin`
   * is how far the wheels have turned (radians), `blur` (0 to 1) how much their spokes smear,
   * `brake` (0 to 1) how hot the discs glow, `nitro` (0 to 1) the flame from the exhaust,
   * `lights` (0 to 1) the headlight beam. `ghost` draws only a neon silhouette, additive.
   */
  hypercar(
    x: number,
    y: number,
    length: number,
    o: {
      body: Color;
      trim: Color;
      neon: Color;
      tilt?: number;
      spin?: number;
      blur?: number;
      brake?: number;
      nitro?: number;
      lights?: number;
      alpha?: number;
      ghost?: boolean;
    },
  ): void;

  // Balloon
  /**
   * A procedural hot-air balloon, its envelope `radius` px to each side and centred at (x, y):
   * silk gores in `stripes` (up to four, taken in turn) with a `pattern`, a skirt, a woven
   * basket on ropes below (the skirt's throat is `1.4 radius` under the middle, the basket's
   * foot `2.27 radius`), and the burner's flame. `heat` (0 to 1) is how much its light glows
   * through the silk and blooms round it; `burn` (0 to 1) how tall the flame stands. It
   * animates with the frame's time.
   */
  hotAirBalloon(
    x: number,
    y: number,
    radius: number,
    o: {
      stripes: readonly Color[];
      skirt: Color;
      outline: Color;
      pattern?: 'plain' | 'bands' | 'chevrons' | 'stars';
      heat?: number;
      burn?: number;
    },
  ): void;
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

  /** Canvas2D painting as a sprite, cached by key unless dynamic; the same as `sprite`, to make the intent plain at the call site. */
  raster(src: SpriteSource, o: SpriteOptions): void;

  // Fireworks
  /**
   * Stars of a firework, additive, one instanced quad each: a glowing head with a streak behind
   * it along its velocity, white-hot at birth, then its colour, then an ember; or, per its
   * `mode`, a drip that falls long and golden, or a little strobing cross of glitter.
   */
  fireworkStars(data: FireworkData): void;
  /** Puffs of smoke (normal blend), eaten into by noise and lit from inside by their colour. */
  fireworkSmoke(data: FireworkData): void;
  /**
   * The flash of a burst going off at (x, y), additive: a white-hot core, jagged rays and a
   * ring of air reaching `reach` px, by `life` (0 when it goes off, 1 when it has died).
   */
  fireworkFlash(
    x: number,
    y: number,
    reach: number,
    life: number,
    color: Color,
    seed: number,
  ): void;
  /**
   * A rocket climbing, additive: a white-hot head at (x, y) in a halo of `color`, with a
   * sparkling fuse that flickers behind it, as far back as (tailX, tailY).
   */
  fireworkRocket(
    x: number,
    y: number,
    tailX: number,
    tailY: number,
    radius: number,
    color: Color,
    seed: number,
  ): void;
}

/** Fireworks' stars or smoke, each a particle; `kit/particles.ts` style, with a few extras (`fireworks/sparks.ts` makes them). */
export interface FireworkData {
  count: number;
  /** 2 per particle, world px. */
  xy: Float32Array;
  /** 2 per particle, px/s: which way its streak points, and how long it is. */
  vel: Float32Array;
  /** Diameter, px. */
  size: Float32Array;
  /** 4 per particle: its colour, and its strength (a star's brightness gain, a puff's light), 0 or more. */
  rgba: Float32Array;
  /** How far through its life each is, 0 to 1. */
  life: Float32Array;
  /** 0 to 1, to tell each from the next. */
  seed: Float32Array;
  /** Stars only: 0 a star, 1 a drip, 2 glitter. */
  mode: Float32Array;
}
