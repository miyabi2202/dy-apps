import type { PileSettings } from '../core/config';
import type { View } from './camera';
import { ContextGuard, getGl } from './gl/context';
import { GlGfx } from './gl/gl-gfx';
import { ParticleBatch } from './gl/particle-batch';
import { PileLayer } from './gl/pile-layer';
import { PostEffects } from './gl/post-effects';
import { PostPass, type PostSettings } from './gl/post-pass';
import { ShapeBatch, type ShapeFrame } from './gl/shape-batch';
import { SpriteCache } from './gl/sprite-cache';
import type { Gfx, Quality } from './gfx';
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
  post: PostPass;
  effects: PostEffects;
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

  constructor(
    private readonly stage: Stage,
    {
      maxPixelRatio = 2,
      devicePixelRatio = () => window.devicePixelRatio || 1,
      quality = 'high',
    }: Options = {},
  ) {
    this.layer = new PileLayer(stage);
    this.maxPixelRatio = maxPixelRatio;
    this.devicePixelRatio = devicePixelRatio;
    this.quality = quality;
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
    return res.gfx;
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
      const gfx = new GlGfx({
        radius: this.stage.radius,
        sprites,
        batch,
        particles: new ParticleBatch(gl),
        effects,
      });
      this.layer.attach(gl);
      this.res = {
        gl,
        sprites,
        batch,
        gfx,
        effects,
        post: new PostPass(gl, postSettings(this.quality)),
      };
    } catch (error) {
      this.res = null;
      this.error = error instanceof Error ? error.message : String(error);
    }
  }
}
