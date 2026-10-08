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
   * A procedural black hole after Gargantua: a pure black horizon with a thin photon ring, a
   * turbulent accretion disk seen nearly edge on (white-blue hot inside, `disk` and darker out,
   * one side beamed brighter), its far side bent over the top and under the bottom of the
   * horizon, and faint jets. `r` is the horizon's radius when fully `open` (0 to 1, which also
   * scales it and its light); the disk reaches six times as far. `glow` tints its halo.
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
  // Pac-Man
  /**
   * A procedural Pac-Man, `r` px to his rim: a glossy sphere with a hot spot, rim light and a
   * neon halo, `mouth` (a half angle) open towards `facing`, a dark hollow inside it, and an
   * eye. `dying` from 0 to 1 takes the eye and halo away; `glow` (default 1) scales the shine.
   */
  pacMan(
    x: number,
    y: number,
    r: number,
    o: {
      color: Color;
      facing: number;
      mouth: number;
      glow?: number;
      dying?: number;
      alpha?: number;
    },
  ): void;
  /**
   * A procedural ghost, `r` px to each side of its middle: a translucent glowing body with a
   * wobbling skirt and glossy eyes looking towards the angle `look`; `scared` gives it pale
   * dots for eyes and a zigzag mouth.
   */
  ghost(
    x: number,
    y: number,
    r: number,
    o: { color: Color; look: number; scared?: boolean; alpha?: number },
  ): void;
  /** A neon pellet `r` px across, on a dark pool so it shows on bright icons, pulsing; a `power` pellet throws a cross of light. `phase` offsets the pulse. */
  pellet(
    x: number,
    y: number,
    r: number,
    o: { color: Color; power?: boolean; phase?: number; alpha?: number },
  ): void;
  /**
   * The neon lane something travels along, towards the angle `angle`: a dim scanlined floor
   * between two glowing tubes `halfWidth` either side of its line, with light chasing along them, fading `ahead` px in front of (x, y) and `behind` px behind.
   */
  neonLane(
    x: number,
    y: number,
    angle: number,
    o: { ahead: number; behind: number; halfWidth: number; color: Color; alpha?: number },
  ): void;
  /** A pop of light, additive: a flash, a ring and twelve rays, `progress` from 0 to 1, up to `r` px out. */
  arcadePop(x: number, y: number, r: number, o: { color: Color; progress: number }): void;
  // Claw
  /**
   * The claw machine's head, hanging from (x, y) (its hub's middle): a glossy hub with a glowing
   * core and a ring of LEDs, three articulated chrome prongs `open` from 0 (shut) to 1, and an
   * electric arc over the tips while `arc` (0 to 1) is up. `body` colours the hub and its
   * light, `metal` tints the chrome; it animates with the frame's time.
   */
  clawHead(
    x: number,
    y: number,
    o: { body: Color; metal: Color; open: number; arc?: number; glow?: number; alpha?: number },
  ): void;
  /**
   * The claw machine's gantry along y, from x0 to x1: a steel channel with chasing RGB LEDs, neon
   * underglow, an end bracket each side, and the glossy carriage at `carriageX`.
   */
  clawRail(
    x0: number,
    x1: number,
    y: number,
    carriageX: number,
    o: { body: Color; rail: Color; alpha?: number },
  ): void;
  /** A chrome chain from (x0, y0) to (x1, y1) that catches the light, `neon` for its glints. */
  clawChain(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    o: { metal: Color; neon: Color; alpha?: number },
  ): void;
  /**
   * A soft cone of light from `topWidth` wide at (x0, y0) down to `bottomWidth` at (x1, y1),
   * with haze and drifting dust motes. Additive; `intensity` (default 1) fades it.
   */
  clawSpotlight(
    x0: number,
    y0: number,
    topWidth: number,
    x1: number,
    y1: number,
    bottomWidth: number,
    o: { color: Color; intensity?: number },
  ): void;
  /** A glowing aura of living energy and orbiting sparkles round a prize `radius` across. Additive. */
  clawAura(x: number, y: number, radius: number, o: { color: Color; intensity?: number }): void;
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

  // Black hole
  /**
   * The black hole's pop, additive, `radius` px to each side and `u` (0 to 1) of the way through:
   * a white-hot flash with a flare, a shockwave ring with a fringe of split colour, and rays of `color`.
   */
  blackHolePop(x: number, y: number, radius: number, u: number, color: Color): void;

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

/** Fireworks' stars or smoke, each a particle; `kit/particles.ts` style, with a few extras (`fireworks/star-pool.ts` makes them). */
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
