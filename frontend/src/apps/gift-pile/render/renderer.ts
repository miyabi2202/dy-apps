import type { PileSettings } from '../core/config';
import type { Frame } from '../core/protocol';
import { createGiftSprite } from './sprite';

/** Makes the icon image at a pixel ratio from the gift image, or without one; a test can return anything. */
export type CreateSprite = (
  size: number,
  pixelRatio: number,
  image: HTMLImageElement | null,
) => CanvasImageSource;

type Stage = Pick<PileSettings, 'world' | 'radius'>;

/**
 * Draws the pile from the frames the physics worker posts, in two layers. Icons at rest are
 * stamped once onto an offscreen canvas as they settle, so a frame copies that one image and
 * then stamps only the moving icons. Each draw costs by what's moving, however big the pile.
 *
 * Frames arrive at the physics rate and draws happen at the display rate, so a moving icon
 * is drawn between where the last two frames put it, by how long ago the latest arrived.
 *
 * The canvas is sized to its CSS box × devicePixelRatio and the world scaled into it, so the
 * icons stay crisp at any page width. The resting layer is repainted when that ratio
 * changes, when the pile is cleared, and when the gift image arrives.
 */
export class PileRenderer {
  private readonly layer = document.createElement('canvas');
  private sprite: CanvasImageSource | null = null;
  private image: HTMLImageElement | null = null;
  private pixelRatio = 0;
  private generation = -1;

  // Every resting icon's position, in order of settling, and how many are on the layer.
  private restingXy = new Float32Array(4096);
  private restingCount = 0;
  private stamped = 0;

  // The latest two frames, for interpolation; `prevAt` maps an icon to its place in `prev`.
  private prev: Frame | null = null;
  private cur: Frame | null = null;
  private curArrived = 0;
  private readonly prevAt = new Map<number, number>();

  // The world's size: the stage's until the first frame says otherwise.
  private world: Stage['world'];

  constructor(
    private readonly stage: Stage,
    private readonly createSprite: CreateSprite = createGiftSprite,
  ) {
    this.world = stage.world;
  }

  /** The gift image to stamp from now on; the next draw rebuilds the sprite and the pile. */
  setImage(image: HTMLImageElement | null): void {
    if (image === this.image) return;
    this.image = image;
    this.pixelRatio = 0;
  }

  /** Take in a frame from the worker, received at wall time `now` (ms). */
  pushFrame(frame: Frame, now: number): void {
    if (frame.width !== this.world.width || frame.height !== this.world.height) {
      this.world = { width: frame.width, height: frame.height };
    }
    if (frame.generation !== this.generation) {
      this.generation = frame.generation;
      this.restingCount = 0;
      this.stamped = 0;
      this.pixelRatio = 0;
      this.prev = null;
    } else {
      this.prev = this.cur;
    }
    this.prevAt.clear();
    if (this.prev) this.prev.movingIds.forEach((id, k) => this.prevAt.set(id, k));
    this.cur = frame;
    this.curArrived = now;

    const need = (this.restingCount + frame.settledIds.length) * 2;
    if (need > this.restingXy.length) {
      const grown = new Float32Array(Math.max(need, this.restingXy.length * 2));
      grown.set(this.restingXy);
      this.restingXy = grown;
    }
    this.restingXy.set(frame.settledXy, this.restingCount * 2);
    this.restingCount += frame.settledIds.length;
  }

  /** Draw the pile as of wall time `now` (ms) into `canvas`. */
  draw(canvas: HTMLCanvasElement, now: number): void {
    const { world } = this;
    const { radius } = this.stage;
    const cssWidth = canvas.clientWidth || world.width;
    const pixelRatio = (cssWidth / world.width) * (window.devicePixelRatio || 1);
    const pw = Math.max(1, Math.round(world.width * pixelRatio));
    const ph = Math.max(1, Math.round(world.height * pixelRatio));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    const layerCtx = this.layer.getContext('2d');
    if (!ctx || !layerCtx) return;

    if (pixelRatio !== this.pixelRatio) {
      this.pixelRatio = pixelRatio;
      this.sprite = this.createSprite(radius * 2, pixelRatio, this.image);
      this.layer.width = pw;
      this.layer.height = ph;
      layerCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.stamped = 0;
    }
    for (; this.stamped < this.restingCount; this.stamped++) {
      this.stamp(
        layerCtx,
        this.restingXy[2 * this.stamped]!,
        this.restingXy[2 * this.stamped + 1]!,
      );
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(this.layer, 0, 0);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const { cur, prev } = this;
    if (!cur) return;
    const span = prev ? Math.max(1, cur.time - prev.time) : 1;
    const alpha = prev ? Math.min(1, Math.max(0, (now - this.curArrived) / span)) : 1;
    const { movingIds, movingXy } = cur;
    for (let k = 0; k < movingIds.length; k++) {
      let x = movingXy[2 * k]!;
      let y = movingXy[2 * k + 1]!;
      const before = prev ? this.prevAt.get(movingIds[k]!) : undefined;
      if (prev && before !== undefined && alpha < 1) {
        const px = prev.movingXy[2 * before]!;
        const py = prev.movingXy[2 * before + 1]!;
        x = px + (x - px) * alpha;
        y = py + (y - py) * alpha;
      }
      this.stamp(ctx, x, y);
    }
  }

  private stamp(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const r = this.stage.radius;
    // Above the top edge: part of the pile, but not on screen.
    if (!this.sprite || y + r < 0) return;
    ctx.drawImage(this.sprite, x - r, y - r, 2 * r, 2 * r);
  }
}
