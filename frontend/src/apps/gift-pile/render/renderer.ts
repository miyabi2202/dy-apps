import type { PileWorld } from '../core/world';
import { createGiftSprite } from './sprite';

/** Makes the icon image at a pixel ratio; the default paints it, a test can return anything. */
export type CreateSprite = (size: number, pixelRatio: number) => CanvasImageSource;

/**
 * Draws the pile in two layers. Icons at rest are stamped once onto an offscreen canvas as
 * they settle, so a frame copies that one image and then stamps only the falling icons.
 * Each frame costs by what's in the air, however big the pile is.
 *
 * The canvas is sized to its CSS box × devicePixelRatio and the world scaled into it, so the
 * icons stay crisp at any page width; the resting layer is repainted when that ratio changes.
 */
export class PileRenderer {
  private readonly layer = document.createElement('canvas');
  private sprite: CanvasImageSource | null = null;
  private pixelRatio = 0;
  private generation = -1;

  constructor(
    private readonly world: PileWorld,
    private readonly createSprite: CreateSprite = createGiftSprite,
  ) {}

  /** Draw the world into `canvas`, called once per frame after the simulation steps. */
  draw(canvas: HTMLCanvasElement): void {
    const { world } = this;
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

    if (pixelRatio !== this.pixelRatio || this.generation !== world.generation) {
      this.pixelRatio = pixelRatio;
      this.generation = world.generation;
      this.sprite = this.createSprite(world.radius * 2, pixelRatio);
      this.layer.width = pw;
      this.layer.height = ph;
      layerCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.repaintResting(layerCtx);
    } else {
      world.drainSettled((i) => this.stamp(layerCtx, i));
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(this.layer, 0, 0);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    world.forEachFalling((i) => this.stamp(ctx, i));
  }

  /** The whole resting pile again, onto a fresh layer. */
  private repaintResting(layerCtx: CanvasRenderingContext2D): void {
    const { world } = this;
    world.drainSettled(() => {});
    for (let i = 0; i < world.count; i++) {
      if (world.resting[i]) this.stamp(layerCtx, i);
    }
  }

  private stamp(ctx: CanvasRenderingContext2D, i: number): void {
    const { world, sprite } = this;
    const r = world.radius;
    const y = world.y[i]!;
    // Above the top edge: part of the pile, but not on screen.
    if (!sprite || y + r < 0) return;
    ctx.drawImage(sprite, world.x[i]! - r, y - r, 2 * r, 2 * r);
  }
}
