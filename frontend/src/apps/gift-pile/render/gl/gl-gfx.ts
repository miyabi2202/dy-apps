import { parseColor, type Rgba } from '../color';
import type {
  Blend,
  Color,
  DashOptions,
  FillOptions,
  FireworkData,
  Gfx,
  ParticleData,
  Quality,
  SpriteOptions,
  SpriteSource,
  StrokeOptions,
} from '../gfx';
import type { ParticleBatch } from './particle-batch';
import type { PostEffects } from './post-effects';
import { KIND, type ShapeBatch, type ShapeFrame } from './shape-batch';
import type { SpriteCache } from './sprite-cache';

const WHITE: Rgba = [1, 1, 1, 1];
const TAU = Math.PI * 2;
/** Anti-aliasing margin around a shape's box, in device px. */
const EDGE_PX = 2;
/** A dashed line stops here, however fine its dashes. */
const MAX_DASHES = 2000;

interface Options {
  /** An icon's drawn radius, in world px. */
  radius: number;
  sprites: SpriteCache;
  batch: ShapeBatch;
  particles: ParticleBatch;
  /** Where the post-pass effects asked for are collected, for the post pass to apply. */
  effects: PostEffects;
}

/** An icon's options: the sprite's, less the source's own size. */
type IconOptions = Pick<
  SpriteOptions,
  'alpha' | 'rotation' | 'scaleX' | 'scaleY' | 'material' | 'blend'
>;

/**
 * `Gfx` over the shapes batch: everything the removals draw becomes triangles, in the order
 * asked for, with the transform stack applied here on the CPU. Primitives are boxes whose
 * fragments work out their own edge (see the shapes shader), so they stay sharp at any scale.
 */
export class GlGfx implements Gfx {
  now = 0;
  quality: Quality = 'high';
  private readonly radius: number;
  private readonly sprites: SpriteCache;
  private readonly batch: ShapeBatch;
  private readonly particleBatch: ParticleBatch;
  private readonly effects: PostEffects;
  private frame: ShapeFrame = { top: 0, width: 1, height: 1, time: 0, px: 1, shakeX: 0, shakeY: 0 };
  // The current transform: x' = a·x + c·y + e, y' = b·x + d·y + f.
  private a = 1;
  private b = 0;
  private c = 0;
  private d = 1;
  private e = 0;
  private f = 0;
  private readonly stack: number[] = [];

  constructor({ radius, sprites, batch, particles, effects }: Options) {
    this.radius = radius;
    this.sprites = sprites;
    this.batch = batch;
    this.particleBatch = particles;
    this.effects = effects;
  }

  /** Start a frame at world time `now` (ms). */
  begin(now: number, frame: ShapeFrame): void {
    this.now = now;
    this.frame = frame;
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;
    this.stack.length = 0;
    this.batch.begin(frame);
    this.particleBatch.begin(frame);
    this.effects.reset();
  }

  /** Draw whatever is still waiting. */
  end(): void {
    this.batch.flush();
  }

  // --- transform ---

  push(x: number, y: number, rotation = 0, scale = 1): void {
    const { a, b, c, d, e, f } = this;
    this.stack.push(a, b, c, d, e, f);
    const la = scale * Math.cos(rotation);
    const lb = scale * Math.sin(rotation);
    this.a = a * la + c * lb;
    this.b = b * la + d * lb;
    this.c = c * la - a * lb;
    this.d = d * la - b * lb;
    this.e = a * x + c * y + e;
    this.f = b * x + d * y + f;
  }

  pop(): void {
    const { stack } = this;
    if (stack.length < 6) return;
    this.f = stack.pop()!;
    this.e = stack.pop()!;
    this.d = stack.pop()!;
    this.c = stack.pop()!;
    this.b = stack.pop()!;
    this.a = stack.pop()!;
  }

  /** How much the transform scales lengths by. */
  private get scale(): number {
    return Math.hypot(this.a, this.b) || 1;
  }

  /** Room round a shape's box for its edge to fade in, in the shape's own units, plus `extra`. */
  private margin(extra = 0): number {
    return extra + (EDGE_PX * this.frame.px) / this.scale;
  }

  /** A vertex at (x, y) in the current transform's space. */
  private vertex(
    x: number,
    y: number,
    u: number,
    v: number,
    color: Rgba,
    alpha: number,
    localX: number,
    localY: number,
  ): number {
    return this.batch.vertex(
      this.a * x + this.c * y + this.e,
      this.b * x + this.d * y + this.f,
      u,
      v,
      color,
      alpha,
      localX,
      localY,
    );
  }

  /**
   * A box centred at (cx, cy), `halfU` × `halfV` to each side, its u axis along (ex, ey), for
   * the current shape: each corner is told where it is in the shape, in px from its middle.
   */
  private box(
    cx: number,
    cy: number,
    ex: number,
    ey: number,
    halfU: number,
    halfV: number,
    color: Rgba,
    alpha: number,
  ): void {
    const s = this.scale;
    const first = this.batch.vertexCount;
    for (const [su, sv] of CORNERS) {
      const lx = su * halfU;
      const ly = sv * halfV;
      this.vertex(
        cx + ex * lx - ey * ly,
        cy + ey * lx + ex * ly,
        0,
        0,
        color,
        alpha,
        lx * s,
        ly * s,
      );
    }
    this.batch.quad(first);
  }

  // --- sprites ---

  icon(x: number, y: number, scale = 1, o: IconOptions = {}): void {
    const size = 2 * this.radius * scale;
    this.textured(this.sprites.icon(), size, size, { x, y, ...o });
  }

  sprite(src: SpriteSource, o: SpriteOptions): void {
    const texture = this.sprites.get(src);
    if (texture) this.textured(texture, src.width, src.height, o);
  }

  raster(src: SpriteSource, o: SpriteOptions): void {
    this.sprite(src, o);
  }

  // Fireworks
  fireworkStars(data: FireworkData): void {
    const s = this.scale;
    const { batch } = this;
    batch.use(null, 'add');
    for (let k = 0; k < data.count; k++) {
      const x = data.xy[2 * k]!;
      const y = data.xy[2 * k + 1]!;
      const size = data.size[k]!;
      const gain = data.rgba[4 * k + 3]!;
      const colour: Rgba = [data.rgba[4 * k]!, data.rgba[4 * k + 1]!, data.rgba[4 * k + 2]!, 1];
      if (data.mode[k] === 2) {
        const reach = size * 0.9;
        batch.shape(KIND.fireworkGlitter, reach * s, data.life[k], data.seed[k], gain);
        this.box(x, y, 1, 0, reach, reach, colour, 1);
        continue;
      }
      const drip = data.mode[k] === 1;
      const vx = data.vel[2 * k]!;
      const vy = data.vel[2 * k + 1]!;
      const speed = Math.hypot(vx, vy);
      const ex = speed > 1e-3 ? vx / speed : 0;
      const ey = speed > 1e-3 ? vy / speed : 1;
      const core = size * (drip ? 0.24 : 0.3);
      const length = Math.min(
        Math.max(speed * (drip ? 0.2 : 0.13), size * 0.5),
        size * (drip ? 8 : 6),
      );
      const pad = core * 5;
      batch.shape(
        KIND.fireworkStar,
        length * s,
        core * s,
        data.life[k],
        data.seed[k],
        gain,
        drip ? 1 : 0,
      );
      this.box(
        x - (ex * length) / 2,
        y - (ey * length) / 2,
        ex,
        ey,
        length / 2 + pad,
        pad,
        colour,
        1,
      );
    }
  }

  fireworkSmoke(data: FireworkData): void {
    const s = this.scale;
    const { batch } = this;
    batch.use(null, 'normal');
    for (let k = 0; k < data.count; k++) {
      const radius = data.size[k]! / 2;
      const colour: Rgba = [data.rgba[4 * k]!, data.rgba[4 * k + 1]!, data.rgba[4 * k + 2]!, 1];
      batch.shape(KIND.fireworkSmoke, radius * s, data.life[k], data.seed[k], data.rgba[4 * k + 3]);
      const half = radius * 1.4;
      this.box(data.xy[2 * k]!, data.xy[2 * k + 1]!, 1, 0, half, half, colour, 1);
    }
  }

  fireworkFlash(
    x: number,
    y: number,
    reach: number,
    life: number,
    color: Color,
    seed: number,
  ): void {
    if (life >= 1) return;
    this.batch.use(null, 'add');
    this.batch.shape(KIND.fireworkFlash, reach * this.scale, life, seed);
    this.box(x, y, 1, 0, reach, reach, parseColor(color), 1);
  }

  fireworkRocket(
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
    const length = Math.max(Math.hypot(dx, dy), radius);
    const ex = length > 1e-3 && Math.hypot(dx, dy) > 1e-3 ? dx / Math.hypot(dx, dy) : 0;
    const ey = Math.hypot(dx, dy) > 1e-3 ? dy / Math.hypot(dx, dy) : -1;
    const pad = radius * 5;
    this.batch.use(null, 'add');
    this.batch.shape(KIND.fireworkRocket, length * this.scale, radius * this.scale, seed);
    this.box(
      x - (ex * length) / 2,
      y - (ey * length) / 2,
      ex,
      ey,
      length / 2 + pad,
      pad,
      parseColor(color),
      1,
    );
  }

  /** A textured box, `width` × `height` unless the options say otherwise, with the options' material. */
  private textured(texture: WebGLTexture, width: number, height: number, o: SpriteOptions): void {
    const sw = (o.width ?? width) * (o.scaleX ?? 1);
    const sh = (o.height ?? height) * (o.scaleY ?? 1);
    const ax = o.anchorX ?? 0.5;
    const ay = o.anchorY ?? 0.5;
    const alpha = o.alpha ?? 1;
    const { batch } = this;
    let color: Rgba = o.tint === undefined ? WHITE : parseColor(o.tint);
    const { material } = o;
    if (!material) {
      const scroll = o.uvOffset;
      if (scroll) batch.shape(KIND.sprite, 0, 0, 0, 0, 1, scroll[0], scroll[1]);
      else batch.shape(KIND.sprite);
    } else if (material.kind === 'holo') {
      color = WHITE;
      batch.shape(KIND.holo, material.angle ?? 0.6, material.strength ?? 0.5);
    } else if (material.kind === 'metal') {
      color = WHITE;
      batch.shape(KIND.metal, 0, material.strength ?? 0.8);
    } else if (material.kind === 'rim') {
      const w = material.width ?? 2;
      color = parseColor(material.color);
      batch.shape(KIND.rim, w / Math.max(1, sw), w / Math.max(1, sh), 1, 0, alpha);
    } else {
      color = parseColor(material.color);
      batch.shape(KIND.solid);
    }
    batch.use(texture, o.blend ?? 'normal');
    const cos = Math.cos(o.rotation ?? 0);
    const sin = Math.sin(o.rotation ?? 0);
    const flip = o.flipX ? -1 : 1;
    const first = batch.vertexCount;
    for (const [u, v] of UV) {
      const lx = flip * (u - ax) * sw;
      const ly = (v - ay) * sh;
      this.vertex(o.x + lx * cos - ly * sin, o.y + lx * sin + ly * cos, u, v, color, alpha, 0, 0);
    }
    batch.quad(first);
  }

  // --- primitives ---

  circle(x: number, y: number, r: number, color: Color, o: FillOptions = {}): void {
    const s = this.scale;
    const rgba = parseColor(color);
    const alpha = o.alpha ?? 1;
    const soft = (o.soft ?? 0) * s;
    this.batch.use(null, o.blend ?? 'normal');
    this.batch.shape(KIND.circle, r * s, 0, 0, soft);
    this.box(x, y, 1, 0, r + this.margin(o.soft), r + this.margin(o.soft), rgba, alpha);
    if (o.stroke) this.ring(x, y, r, o.stroke.width, o.stroke.color, { alpha, blend: o.blend });
  }

  ring(x: number, y: number, r: number, width: number, color: Color, o: FillOptions = {}): void {
    const s = this.scale;
    const half = r + width / 2 + this.margin(o.soft);
    this.batch.use(null, o.blend ?? 'normal');
    this.batch.shape(KIND.circle, r * s, 0, 0, (o.soft ?? 0) * s, width * s);
    this.box(x, y, 1, 0, half, half, parseColor(color), o.alpha ?? 1);
  }

  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    color: Color,
    o: FillOptions = {},
  ): void {
    const s = this.scale;
    const rgba = parseColor(color);
    const alpha = o.alpha ?? 1;
    const ex = Math.cos(rotation);
    const ey = Math.sin(rotation);
    const m = this.margin(o.soft);
    this.batch.use(null, o.blend ?? 'normal');
    this.batch.shape(KIND.ellipse, rx * s, ry * s, 0, (o.soft ?? 0) * s);
    this.box(x, y, ex, ey, rx + m, ry + m, rgba, alpha);
    if (o.stroke) {
      this.ellipseStroke(x, y, rx, ry, rotation, o.stroke.width, o.stroke.color, {
        alpha,
        blend: o.blend,
      });
    }
  }

  ellipseStroke(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    width: number,
    color: Color,
    o: StrokeOptions & DashOptions = {},
  ): void {
    const s = this.scale;
    const dash = o.dash;
    const m = this.margin(width / 2);
    this.batch.use(null, o.blend ?? 'normal');
    this.batch.shape(
      KIND.ellipse,
      rx * s,
      ry * s,
      0,
      0,
      width * s,
      dash ? dash[0] * s : 0,
      dash ? dash[1] * s : 0,
      (o.dashOffset ?? 0) * s,
    );
    this.box(
      x,
      y,
      Math.cos(rotation),
      Math.sin(rotation),
      rx + m,
      ry + m,
      parseColor(color),
      o.alpha ?? 1,
    );
  }

  wedge(
    x: number,
    y: number,
    r: number,
    from: number,
    to: number,
    color: Color,
    o: FillOptions = {},
  ): void {
    const s = this.scale;
    const span = Math.min(TAU, Math.max(0, to - from));
    const half = r + this.margin(o.soft);
    this.batch.use(null, o.blend ?? 'normal');
    this.batch.shape(KIND.wedge, r * s, from, span, (o.soft ?? 0) * s);
    this.box(x, y, 1, 0, half, half, parseColor(color), o.alpha ?? 1);
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: Color,
    o: FillOptions & { radius?: number; rotation?: number } = {},
  ): void {
    const s = this.scale;
    const rgba = parseColor(color);
    const alpha = o.alpha ?? 1;
    const hw = w / 2;
    const hh = h / 2;
    const radius = Math.min(o.radius ?? 0, hw, hh);
    const ex = Math.cos(o.rotation ?? 0);
    const ey = Math.sin(o.rotation ?? 0);
    const cx = x + hw;
    const cy = y + hh;
    const m = this.margin(o.soft);
    this.batch.use(null, o.blend ?? 'normal');
    this.batch.shape(KIND.rect, hw * s, hh * s, radius * s, (o.soft ?? 0) * s);
    this.box(cx, cy, ex, ey, hw + m, hh + m, rgba, alpha);
    if (o.stroke) {
      const edge = this.margin(o.stroke.width / 2);
      this.batch.shape(KIND.rect, hw * s, hh * s, radius * s, 0, o.stroke.width * s);
      this.box(cx, cy, ex, ey, hw + edge, hh + edge, parseColor(o.stroke.color), alpha);
    }
  }

  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    color: Color,
    o: StrokeOptions & DashOptions = {},
  ): void {
    this.stroke([x0, y0, x1, y1], width, color, o);
  }

  polyline(
    points: ArrayLike<number>,
    width: number,
    color: Color,
    o: StrokeOptions & DashOptions = {},
  ): void {
    this.stroke(points, width, color, o);
  }

  /** A path of segments, each a capsule (or a plain rectangle with `cap: 'butt'`), cut into dashes if asked. */
  private stroke(
    points: ArrayLike<number>,
    width: number,
    color: Color,
    o: StrokeOptions & DashOptions,
  ): void {
    const rgba = parseColor(color);
    const alpha = o.alpha ?? 1;
    const round = (o.cap ?? 'round') === 'round';
    this.batch.use(null, o.blend ?? 'normal');
    const n = Math.floor(points.length / 2);
    const dash = o.dash;
    if (!dash || dash[0] <= 0 || dash[0] + dash[1] <= 0) {
      for (let k = 0; k + 1 < n; k++) {
        this.segment(
          points[2 * k]!,
          points[2 * k + 1]!,
          points[2 * k + 2]!,
          points[2 * k + 3]!,
          width,
          rgba,
          alpha,
          round,
        );
      }
      return;
    }
    const [on, off] = dash;
    const period = on + off;
    const at = (((o.dashOffset ?? 0) % period) + period) % period;
    let drawing = at < on;
    let left = drawing ? on - at : period - at;
    let emitted = 0;
    for (let k = 0; k + 1 < n && emitted < MAX_DASHES; k++) {
      const ax = points[2 * k]!;
      const ay = points[2 * k + 1]!;
      const dx = points[2 * k + 2]! - ax;
      const dy = points[2 * k + 3]! - ay;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      let t = 0;
      while (t < length && emitted < MAX_DASHES) {
        const step = Math.min(left, length - t);
        if (drawing && step > 0) {
          const u0 = t / length;
          const u1 = (t + step) / length;
          this.segment(
            ax + dx * u0,
            ay + dy * u0,
            ax + dx * u1,
            ay + dy * u1,
            width,
            rgba,
            alpha,
            round,
          );
          emitted++;
        }
        t += step;
        left -= step;
        if (left <= 1e-9) {
          drawing = !drawing;
          left = drawing ? on : off;
        }
      }
    }
  }

  /** One segment of a stroke. */
  private segment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    color: Rgba,
    alpha: number,
    round: boolean,
  ): void {
    const s = this.scale;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    if (length === 0 && !round) return;
    const ex = length === 0 ? 1 : dx / length;
    const ey = length === 0 ? 0 : dy / length;
    const half = width / 2;
    const spine = length / 2;
    const m = this.margin();
    if (round) this.batch.shape(KIND.capsule, spine * s, half * s);
    else this.batch.shape(KIND.rect, spine * s, half * s, 0);
    this.box(
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      ex,
      ey,
      spine + (round ? half : 0) + m,
      half + m,
      color,
      alpha,
    );
  }

  polygon(points: ArrayLike<number>, color: Color, o: FillOptions = {}): void {
    const n = Math.floor(points.length / 2);
    if (n < 3) return;
    const rgba = parseColor(color);
    const alpha = o.alpha ?? 1;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < n; k++) {
      cx += points[2 * k]!;
      cy += points[2 * k + 1]!;
    }
    this.batch.use(null, o.blend ?? 'normal');
    this.batch.shape(KIND.flat);
    const centre = this.vertex(cx / n, cy / n, 0, 0, rgba, alpha, 0, 0);
    for (let k = 0; k < n; k++)
      this.vertex(points[2 * k]!, points[2 * k + 1]!, 0, 0, rgba, alpha, 0, 0);
    for (let k = 0; k < n; k++)
      this.batch.triangle(centre, centre + 1 + k, centre + 1 + ((k + 1) % n));
    if (o.stroke) {
      const closed = Array.from(points);
      closed.push(points[0]!, points[1]!);
      this.stroke(closed, o.stroke.width, o.stroke.color, { alpha, blend: o.blend });
    }
  }

  quad(
    xy: readonly [number, number, number, number, number, number, number, number],
    colors: readonly [Color, Color, Color, Color],
    o: { blend?: Blend; alpha?: number } = {},
  ): void {
    const alpha = o.alpha ?? 1;
    this.batch.use(null, o.blend ?? 'normal');
    this.batch.shape(KIND.flat);
    const first = this.batch.vertexCount;
    for (let k = 0; k < 4; k++) {
      this.vertex(xy[2 * k]!, xy[2 * k + 1]!, 0, 0, parseColor(colors[k]!), alpha, 0, 0);
    }
    this.batch.quad(first);
  }

  // --- effects ---

  glow(
    x: number,
    y: number,
    r: number,
    color: Color,
    o: { intensity?: number; falloff?: number; inner?: number; blend?: Blend } = {},
  ): void {
    this.batch.use(null, o.blend ?? 'add');
    this.batch.shape(KIND.glow, o.falloff ?? 1, o.inner ?? 0, r * this.scale);
    this.box(x, y, 1, 0, r, r, parseColor(color), o.intensity ?? 1);
  }

  particles(data: ParticleData): void {
    if (data.count <= 0) return;
    // Draw what came before first, so the layers keep their order.
    this.batch.flush();
    this.particleBatch.draw(data, this.sprites.shape(data.shape), data.blend ?? 'add');
  }

  blackHole(
    x: number,
    y: number,
    r: number,
    open: number,
    colors: { glow: Color; disk: Color },
  ): void {
    const hole = r * Math.min(1, open);
    if (hole <= 0.01) return;
    const s = this.scale;
    const [dr, dg, db] = parseColor(colors.disk);
    this.batch.use(null, 'normal');
    this.batch.shape(KIND.blackHole, hole * s, dr, dg, db, Math.min(1, open));
    const half = hole * 4;
    this.box(x, y, 1, 0, half, half, parseColor(colors.glow), 1);
  }

  saucer(
    x: number,
    y: number,
    width: number,
    o: { hull: Color; dome: Color; lights: Color; tilt?: number; glow?: number; alpha?: number },
  ): void {
    const s = this.scale;
    const R = width / 2;
    const [hr, hg, hb] = parseColor(o.hull);
    const [dr, dg, db] = parseColor(o.dome);
    const tilt = o.tilt ?? 0;
    this.batch.use(null, 'normal');
    this.batch.shape(KIND.saucer, R * s, hr, hg, hb, dr, dg, db, o.glow ?? 1);
    const half = R * 1.3;
    this.box(x, y, Math.cos(tilt), Math.sin(tilt), half, half, parseColor(o.lights), o.alpha ?? 1);
  }

  plasmaBeam(
    topX: number,
    topY: number,
    topWidth: number,
    bottomY: number,
    bottomWidth: number,
    o: { color: Color; intensity?: number },
  ): void {
    const length = bottomY - topY;
    if (length <= 0) return;
    const s = this.scale;
    const strength = o.intensity ?? 1;
    this.batch.use(null, 'add');
    this.batch.shape(
      KIND.plasmaBeam,
      (topWidth / 2) * s,
      (bottomWidth / 2) * s,
      length * s,
      strength,
    );
    const wide = Math.max(topWidth, bottomWidth) / 2;
    const halfX = wide * 1.45 + 6;
    const pool = wide * 0.35;
    // Taller than the beam by room for the pool at its foot (the same above, which stays dark).
    this.box(topX, topY + length / 2, 1, 0, halfX, length / 2 + pool, parseColor(o.color), 1);
  }

  // Helicopter
  chopper(
    x: number,
    y: number,
    unit: number,
    o: { body: Color; stripe: Color; glass?: Color; time: number; alpha?: number },
  ): void {
    const [br, bg, bb] = parseColor(o.body);
    const [sr, sg, sb] = parseColor(o.stripe);
    this.batch.use(null, 'normal');
    this.batch.shape(KIND.chopper, unit * this.scale, br, bg, bb, sr, sg, sb, o.time);
    // Room for the rotor's tips, the tail's lights and the glow round them.
    this.box(x, y, 1, 0, unit * 20, unit * 16, parseColor(o.glass ?? '#7dd3fc'), o.alpha ?? 1);
  }
  // Hypercar
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
  ): void {
    const s = this.scale;
    const k = length / 64;
    const tilt = o.tilt ?? 0;
    const ex = Math.cos(tilt);
    const ey = Math.sin(tilt);
    const alpha = o.alpha ?? 1;
    const neon = parseColor(o.neon);
    const [br, bg, bb] = parseColor(o.body);
    const [tr, tg, tb] = parseColor(o.trim);
    /** A point of the car, in its own frame (px of a car 64 long), in the world. */
    const at = (lx: number, ly: number): [number, number] => [
      x + (lx * ex - ly * ey) * k,
      y + (lx * ey + ly * ex) * k,
    ];
    if (o.ghost) {
      this.batch.use(null, 'add');
      this.batch.shape(KIND.hypercar, (length / 2) * s, br, bg, bb, tr, tg, tb, 1);
      this.box(x, y, ex, ey, 42 * k, 20 * k, neon, alpha);
      return;
    }
    // The neon on the road, and the nitro's flame, behind the car.
    this.batch.use(null, 'add');
    this.batch.shape(KIND.hypercarGlow, (length / 2) * s, 1);
    this.box(x, y, ex, ey, 46 * k, 22 * k, neon, alpha);
    const nitro = o.nitro ?? 0;
    if (nitro > 0) {
      const flame = 74 * k;
      const [fx, fy] = at(-33.5, 2.6);
      this.batch.shape(KIND.hypercarFlame, flame * s, 3.2 * k * s, nitro);
      this.box(
        fx - ex * flame * 0.5,
        fy - ey * flame * 0.5,
        -ex,
        -ey,
        flame * 0.5,
        8 * k,
        parseColor('#f97316'),
        alpha,
      );
    }
    // The wheels, then the body over them.
    this.batch.use(null, 'normal');
    const radius = 6.2 * k;
    this.batch.shape(KIND.hypercarWheel, radius * s, o.spin ?? 0, o.blur ?? 0, o.brake ?? 0);
    for (const wx of [-21.5, 21.5]) {
      const [cx, cy] = at(wx, 5.5);
      this.box(cx, cy, ex, ey, radius * 1.3, radius * 1.3, neon, alpha);
    }
    this.batch.shape(KIND.hypercar, (length / 2) * s, br, bg, bb, tr, tg, tb, 0);
    this.box(x, y, ex, ey, 42 * k, 20 * k, neon, alpha);
    // The headlights' beam, over it.
    const lights = o.lights ?? 0;
    if (lights > 0) {
      const beam = 110 * k;
      const aim = tilt + 0.13;
      const [lx, ly] = at(31, -1.4);
      const bx = Math.cos(aim);
      const by = Math.sin(aim);
      this.batch.use(null, 'add');
      this.batch.shape(KIND.hypercarBeam, beam * s, 1.2 * k * s, 17 * k * s, lights);
      this.box(
        lx + bx * beam * 0.5,
        ly + by * beam * 0.5,
        bx,
        by,
        beam * 0.5,
        22 * k,
        parseColor('#fef9c3'),
        alpha,
      );
    }
  }

  ribbon(
    points: ArrayLike<number>,
    width: number | ((u: number) => number),
    color: Color,
    o: { blend?: Blend; alphaFrom?: number; alphaTo?: number } = {},
  ): void {
    const n = Math.floor(points.length / 2);
    if (n < 2) return;
    const rgba = parseColor(color);
    this.batch.use(null, o.blend ?? 'normal');
    this.batch.shape(KIND.flat);
    const from = o.alphaFrom ?? 1;
    const to = o.alphaTo ?? 0;
    const first = this.batch.vertexCount;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);
      const before = Math.max(0, k - 1);
      const after = Math.min(n - 1, k + 1);
      const dx = points[2 * after]! - points[2 * before]!;
      const dy = points[2 * after + 1]! - points[2 * before + 1]!;
      const length = Math.hypot(dx, dy) || 1;
      const half = (typeof width === 'number' ? width : width(u)) / 2;
      const nx = (-dy / length) * half;
      const ny = (dx / length) * half;
      const alpha = from + (to - from) * u;
      const x = points[2 * k]!;
      const y = points[2 * k + 1]!;
      this.vertex(x + nx, y + ny, 0, 0, rgba, alpha, 0, 0);
      this.vertex(x - nx, y - ny, 0, 0, rgba, alpha, 0, 0);
    }
    for (let k = 0; k + 1 < n; k++) {
      const i = first + 2 * k;
      this.batch.triangle(i, i + 1, i + 2);
      this.batch.triangle(i + 1, i + 3, i + 2);
    }
  }

  /** Rays from the view's edges towards (cx, cy), like a manga's speed lines. */
  speedLines(
    cx: number,
    cy: number,
    o: { count?: number; inner?: number; color?: Color; alpha?: number; seed?: number } = {},
  ): void {
    const count = Math.min(o.count ?? 24, 200);
    const inner = Math.min(0.95, Math.max(0, o.inner ?? 0.55));
    const alpha = o.alpha ?? 0.5;
    const seed = o.seed ?? 0;
    const rgba = parseColor(o.color ?? '#ffffff');
    const { top, width, height } = this.frame;
    // The lines flicker a few times a second, as drawn ones do.
    const step = Math.floor(this.now / 70);
    this.batch.use(null, 'normal');
    this.batch.shape(KIND.flat);
    for (let k = 0; k < count; k++) {
      const angle = hash(seed + k * 7.31) * TAU;
      const ex = Math.cos(angle);
      const ey = Math.sin(angle);
      // How far it is from the centre to the view's edge this way, and the line runs out past it.
      const toX = ex > 0 ? (width - cx) / ex : ex < 0 ? -cx / ex : Infinity;
      const toY = ey > 0 ? (top + height - cy) / ey : ey < 0 ? (top - cy) / ey : Infinity;
      const edge = Math.max(24, Math.min(toX, toY));
      const start = edge * (inner + (1 - inner) * 0.7 * hash(seed + k * 3.17 + step * 0.37));
      const end = edge + 24;
      const half = 2 + 6 * hash(seed + k * 5.59);
      const base = this.batch.vertexCount;
      this.vertex(cx + ex * start, cy + ey * start, 0, 0, rgba, 0, 0, 0);
      this.vertex(cx + ex * end - ey * half, cy + ey * end + ex * half, 0, 0, rgba, alpha, 0, 0);
      this.vertex(cx + ex * end + ey * half, cy + ey * end - ex * half, 0, 0, rgba, alpha, 0, 0);
      this.batch.triangle(base, base + 1, base + 2);
    }
  }

  // The effects on the whole picture are collected for the post pass, which applies them.

  shockwave(x: number, y: number, radius: number, width: number, strength: number): void {
    const s = this.scale;
    this.effects.shockwave(this.worldX(x, y), this.worldY(x, y), radius * s, width * s, strength);
  }

  lens(x: number, y: number, radius: number, strength: number): void {
    this.effects.pull(this.worldX(x, y), this.worldY(x, y), radius * this.scale, strength);
  }

  haze(x: number, y: number, w: number, h: number, strength: number): void {
    const s = this.scale;
    this.effects.haze(this.worldX(x, y), this.worldY(x, y), w * s, h * s, strength);
  }

  aberration(strength: number): void {
    this.effects.split(strength);
  }

  flash(color: Color, alpha: number): void {
    const [r, g, b, a] = parseColor(color);
    this.effects.tint(r, g, b, alpha * a);
  }

  private worldX(x: number, y: number): number {
    return this.a * x + this.c * y + this.e;
  }

  private worldY(x: number, y: number): number {
    return this.b * x + this.d * y + this.f;
  }
}

/** A repeatable pseudo-random number in [0, 1) from `n`. */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;
const UV = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;
