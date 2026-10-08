import type { PileSettings } from '../core/config';
import { bakeSprite } from './bake';
import type { View } from './camera';
import { ContextGuard, getGl } from './gl/context';
import { devLog } from './gl/dev-log';
import { GlGfx } from './gl/gl-gfx';
import { ParticleBatch } from './gl/particle-batch';
import { PileLayer } from './gl/pile-layer';
import { PostEffects } from './gl/post-effects';
import { PostPass, type PostSettings } from './gl/post-pass';
import { ShaderPrograms } from './gl/shader-programs';
import { ShapeBatch, type ShapeFrame } from './gl/shape-batch';
import { SpriteCache } from './gl/sprite-cache';
import { parallelCompile } from './gl/program';
import { WarmUp } from './gl/warm-up';
import type { Gfx, Quality, ShaderSource, SpriteSource } from './gfx';
import type { ChangeJournal, PileState } from './pile-state';

type Stage = Pick<PileSettings, 'radius' | 'maxItems'>;

/** An icon the user is holding, and where (pixels). */
export interface Held {
  id: number;
  x: number;
  y: number;
}

/** How far the whole picture is moved this frame, in world pixels (a screen shake). */
export interface FrameOffset {
  x: number;
  y: number;
}

interface Options {
  /** The most device pixels per CSS pixel to draw at; more is crisper but costs fill rate. */
  maxPixelRatio?: number;
  /** The current device pixel ratio; the window's by default. */
  devicePixelRatio?: () => number;
  /** What the effects may cost; `high` by default. */
  quality?: Quality;
  /**
   * Procedural drawings to compile up front, so the first `Gfx.shade` of each is instant. Any
   * other `ShaderSource` still works, compiled at its first use.
   */
  shaders?: readonly ShaderSource[];
}

/** What each quality costs: `high` smooths edges more, blooms bright light, and sweeps a sheen over the pile. */
function postSettings(quality: Quality): PostSettings {
  return quality === 'high' ? { samples: 4, bloom: true } : { samples: 2, bloom: false };
}

/** A held icon is drawn this much bigger, as if lifted towards the viewer. */
const HELD_SCALE = 1.2;

/** The GL objects of one context, made again if it is lost and given back. */
interface Resources {
  gl: WebGL2RenderingContext;
  sprites: SpriteCache;
  batch: ShapeBatch;
  gfx: GlGfx;
  particles: ParticleBatch;
  post: PostPass;
  effects: PostEffects;
  shaders: ShaderPrograms;
  /** The programs every frame needs: nothing is drawn until they are linked. */
  coreWarm: WarmUp;
  /** The removers' programs, which may finish after the first frame. */
  shaderWarm: WarmUp;
  /** Every program has been drawn with once (see `warmDraw`). */
  warmed: boolean;
  /** When this was built (ms), for the dev timings. */
  builtAt: number;
  /** The first frame has been logged. */
  logged: boolean;
}

/**
 * Draws the pile with WebGL2 and hands the removals a `Gfx` to draw over it. It only draws
 * what the controller gives it each frame: the state, the view, a shake. It owns the context
 * and everything on the GPU.
 *
 * A frame is `begin` (size the canvas, draw the pile, return the `Gfx`) and `end` (the held
 * icon on top, then the scene onto the canvas). Everything is drawn into an offscreen target
 * first, so effects can act on the finished picture (see `PostPass`), in premultiplied
 * colour over a transparent canvas, so the page's (or OBS's) background shows through.
 *
 * Frames arrive at the physics rate and draws happen at the display rate: a moving icon is
 * drawn between where the last two frames put it, by how long ago the latest arrived (see
 * `PileLayer`).
 *
 * The canvas is sized to its CSS box × devicePixelRatio and the world scaled into it, so the
 * icons stay crisp at any page width. Nothing here touches the document or GL until the first
 * `begin`, and when the context is lost nothing is drawn until it is given back, then
 * everything is rebuilt from what the renderer keeps on the CPU side.
 */
export class GlRenderer {
  /** Why it can't draw, once it has found out; null while it can. */
  error: string | null = null;

  private readonly layer: PileLayer;
  private readonly maxPixelRatio: number;
  private readonly devicePixelRatio: () => number;
  private image: HTMLImageElement | null = null;
  private held: Held | null = null;
  private quality: Quality;
  /** The frame being drawn, for the post pass. */
  private frame: ShapeFrame = { top: 0, width: 1, height: 1, time: 0, px: 1, shakeX: 0, shakeY: 0 };

  private canvas: HTMLCanvasElement | null = null;
  private guard: ContextGuard | null = null;
  private res: Resources | null = null;
  /** The frame being drawn, between `begin` and `end`. */
  private drawing = false;
  private readonly precompile: readonly ShaderSource[];
  /** Work to do ahead of use, one step a frame once the programs are drawn (see `warmUp`). */
  private warmQueue: Array<(res: Resources) => void> = [];

  constructor(
    private readonly stage: Stage,
    {
      maxPixelRatio = 2,
      devicePixelRatio = () => window.devicePixelRatio || 1,
      quality = 'high',
      shaders = [],
    }: Options = {},
  ) {
    this.layer = new PileLayer(stage);
    this.maxPixelRatio = maxPixelRatio;
    this.devicePixelRatio = devicePixelRatio;
    this.quality = quality;
    this.precompile = shaders;
  }

  /** Change what the effects may cost, from the next frame on. */
  setQuality(quality: Quality): void {
    this.quality = quality;
    this.res?.post.configure(postSettings(quality));
  }

  /** The user is holding this icon here, or (null) nothing. */
  hold(held: Held | null): void {
    this.held = held;
  }

  /** The gift image to draw from now on. */
  setImage(image: HTMLImageElement | null): void {
    this.image = image;
    this.res?.sprites.setIconImage(image);
  }

  /**
   * Take in what happened to the resting set since the last call, from the state's journal,
   * and empty it. The GPU's copy is brought up to date by the next draw.
   */
  apply(journal: ChangeJournal): void {
    this.layer.apply(journal);
  }

  /**
   * Start a display frame in `canvas`: size it, then draw the pile in `state` as of wall time
   * `now` (ms) through `view`, moved by `shake`. Returns what to draw the removals with, or
   * null if there is nothing to draw on.
   */
  begin(
    canvas: HTMLCanvasElement,
    now: number,
    state: PileState,
    view: View,
    shake: FrameOffset,
  ): Gfx | null {
    this.drawing = false;
    if (canvas !== this.canvas) this.attach(canvas);
    if (this.error !== null || this.guard?.isLost) return null;
    const { res } = this;
    if (!res) return null;
    const { gl } = res;
    if (gl.isContextLost()) return null;
    // Until the programs every frame needs are linked there is nothing to draw with; without
    // parallel compile this links one a frame, so the page never freezes on them.
    if (!res.coreWarm.done) {
      res.coreWarm.step();
      if (this.error !== null || !res.coreWarm.done) return null;
    }
    res.shaderWarm.step();

    const { world } = state;
    const cssWidth = canvas.clientWidth || world.width;
    const pixelRatio =
      (cssWidth / world.width) * Math.min(this.devicePixelRatio(), this.maxPixelRatio);
    const pw = Math.max(1, Math.round(world.width * pixelRatio));
    const ph = Math.max(1, Math.round(world.height * pixelRatio));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }

    res.post.begin(pw, ph);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    if (!res.warmed && res.shaderWarm.done) this.warmDraw(res);
    else if (res.warmed) this.warmQueue.shift()?.(res);
    this.layer.draw(state, {
      view: { top: view.top, width: world.width, height: world.height },
      shake,
      now,
      heldId: this.held?.id ?? -1,
      texture: res.sprites.icon(),
      sheen: this.quality === 'high',
    });
    this.frame = {
      top: view.top,
      width: world.width,
      height: world.height,
      time: now,
      px: world.width / pw,
      shakeX: shake.x,
      shakeY: shake.y,
    };
    res.gfx.quality = this.quality;
    res.gfx.begin(now, this.frame);
    this.drawing = true;
    if (!res.logged) {
      res.logged = true;
      devLog(`first frame drawn ${(performance.now() - res.builtAt).toFixed(1)} ms after setup`);
    }
    return res.gfx;
  }

  /**
   * Bake art the first effects will need, one piece a frame once everything is compiled, so
   * none of it is paid for in the middle of the first removal: the particles' soft shapes, and
   * each of `art` (the cut-in portraits) painted once, which wakes Canvas2D's gradients and
   * shadows. The controller calls this once, after the first frame.
   */
  warmUp(art: readonly SpriteSource[]): void {
    const shapes = ['disc', 'spark', 'ring', 'star'] as const;
    for (const name of shapes) this.warmQueue.push((res) => void res.sprites.shape(name));
    for (const src of art) this.warmQueue.push(() => void bakeSprite(src, 2));
  }

  /**
   * Draw one invisible speck with every program in each blend, into the scene target, so the
   * driver builds the pipelines (ANGLE and Metal finish them lazily, at the first draw) now
   * rather than when the first removal shows.
   */
  private warmDraw(res: Resources): void {
    const t0 = performance.now();
    res.warmed = true;
    res.batch.warm(res.shaders.linked);
    res.particles.warm(res.sprites.shape('disc'));
    devLog(
      `warm-up draw of ${res.shaders.linked.length + 1} programs took (to issue) ${(performance.now() - t0).toFixed(1)} ms`,
    );
  }

  /** Draw the icon the user is holding on top of everything, and put the frame on the canvas. */
  end(): void {
    const { res, held } = this;
    if (!res || !this.drawing) return;
    this.drawing = false;
    if (held) res.gfx.icon(held.x, held.y, HELD_SCALE);
    res.gfx.end();
    res.post.end(res.effects, this.frame);
  }

  /** Take `canvas` over: get its context and build everything for it. */
  private attach(canvas: HTMLCanvasElement): void {
    this.guard?.dispose();
    this.layer.detach();
    this.res = null;
    this.canvas = canvas;
    this.error = null;
    const gl = getGl(canvas);
    if (!gl) {
      this.error = 'WebGL2 is not available';
      return;
    }
    this.guard = new ContextGuard(canvas, () => this.build(gl));
    this.build(gl);
  }

  /** Make the GPU objects in `gl`: when first attached, and again when a lost context is given back. */
  private build(gl: WebGL2RenderingContext): void {
    try {
      const sprites = new SpriteCache(gl);
      sprites.setIconImage(this.image);
      const batch = new ShapeBatch(gl, sprites.white);
      const effects = new PostEffects();
      const builtAt = performance.now();
      devLog(`parallel shader compile: ${parallelCompile(gl) ? 'yes' : 'no'}`);
      const coreWarm = new WarmUp(gl);
      const shaderWarm = new WarmUp(gl);
      const shaders = new ShaderPrograms(gl, shaderWarm);
      const particles = new ParticleBatch(gl);
      const post = new PostPass(gl, postSettings(this.quality));
      this.layer.attach(gl);
      shaders.precompile(this.precompile);
      const core = [
        ...batch.corePrograms,
        ...particles.programs,
        ...this.layer.programs,
        ...post.programs,
      ];
      for (const program of core) {
        coreWarm.add({
          program,
          settle: (failure) => {
            if (failure && this.error === null) this.error = failure.message;
          },
        });
      }
      const gfx = new GlGfx({
        radius: this.stage.radius,
        sprites,
        batch,
        particles,
        effects,
        shaders,
      });
      this.res = {
        gl,
        sprites,
        batch,
        gfx,
        particles,
        effects,
        post,
        shaders,
        coreWarm,
        shaderWarm,
        warmed: false,
        builtAt,
        logged: false,
      };
    } catch (error) {
      this.res = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }
}
