import type { PileSettings } from '../core/config';
import type { View } from './camera';
import { type ChangeJournal, type PileState, REMOVED_STRIDE } from './pile-state';
import { createGiftSprite } from './sprite';

/** Makes the icon image at a pixel ratio from the gift image, or without one; a test can return anything. */
export type CreateSprite = (
  size: number,
  pixelRatio: number,
  image: HTMLImageElement | null,
) => CanvasImageSource;

type Stage = Pick<PileSettings, 'radius'>;

/** An icon the user is holding, and where (pixels). */
export interface Held {
  id: number;
  x: number;
  y: number;
}

/** A held icon is drawn this much bigger, as if lifted towards the viewer. */
const HELD_SCALE = 1.2;
/** The resting layer covers this many views' height, so the camera can move a way before it is repainted. */
const LAYER_VIEWS = 2;

/**
 * Draws the pile from where `PileState` says everything is, in two layers. Icons at rest are
 * stamped once onto an offscreen canvas as they settle, so a frame copies that one image and
 * then stamps only the moving icons. Each draw costs by what's moving, however big the pile.
 * When an icon leaves the pile, only its patch of the layer is repainted.
 *
 * Frames arrive at the physics rate and draws happen at the display rate, so a moving icon
 * is drawn between where the last two frames put it, by how long ago the latest arrived.
 *
 * The canvas is sized to its CSS box × devicePixelRatio and the world scaled into it, so the
 * icons stay crisp at any page width. The resting layer is repainted when that ratio
 * changes, when the pile is cleared, and when the gift image arrives.
 *
 * It draws the world as seen through the view it is given: the world shifted up by the
 * view's top. The resting layer covers more than the view, and is repainted where the view
 * now is once the view leaves it. What the removals and the held icon add on top is drawn by
 * whoever has them, with `stamp`, between `draw` and `drawHeld`.
 *
 * It keeps its layer in step with the resting set by the state's journal (`apply`), not
 * by looking at the set itself: removals swap-fill a slot, so what needs repainting is only
 * what the journal says left.
 */
export class PileRenderer {
  private readonly layer = document.createElement('canvas');
  private sprite: CanvasImageSource | null = null;
  private image: HTMLImageElement | null = null;
  private pixelRatio = 0;

  // How many resting slots are on the layer so far.
  private stamped = 0;
  // Patches of the layer to repaint, as x, y pairs: an icon left from there.
  private holes: number[] = [];
  // Icons moved below the stamped mark to fill a gap before their turn, so not yet drawn.
  // By icon, since more removals can move them again before the next draw.
  private unstamped: number[] = [];

  /** The icon the user is holding, drawn on top of the rest. */
  private held: Held | null = null;
  /** The world y of the view's top as of the last draw, and of the resting layer's. */
  private viewTop = 0;
  private layerTop = 0;
  /** The canvas's height in world pixels as of the last draw. */
  private worldHeight = 0;

  constructor(
    private readonly stage: Stage,
    private readonly createSprite: CreateSprite = createGiftSprite,
  ) {}

  /** The user is holding this icon here, or (null) nothing. */
  hold(held: Held | null): void {
    this.held = held;
  }

  /** The gift image to stamp from now on; the next draw rebuilds the sprite and the pile. */
  setImage(image: HTMLImageElement | null): void {
    if (image === this.image) return;
    this.image = image;
    this.pixelRatio = 0;
  }

  /**
   * Take in what happened to the resting set since the last call, from the state's journal,
   * and empty it. The layer itself is brought up to date by the next draw.
   */
  apply(journal: ChangeJournal): void {
    if (journal.reset) {
      this.stamped = 0;
      this.holes = [];
      this.unstamped = [];
      this.pixelRatio = 0;
    }
    const { removed } = journal;
    for (let k = 0; k < removed.length; k += REMOVED_STRIDE) {
      this.removeResting(
        removed[k]!,
        removed[k + 1]!,
        removed[k + 2]!,
        removed[k + 3]!,
        removed[k + 4]!,
      );
    }
    journal.clear();
  }

  /**
   * Draw the pile in `state`, as of wall time `now` (ms), into `canvas` as seen through
   * `view`. Returns the canvas's context, set to draw in world pixels as the view has them,
   * for what goes on top; null if there is none.
   */
  draw(
    canvas: HTMLCanvasElement,
    now: number,
    state: PileState,
    view: View,
  ): CanvasRenderingContext2D | null {
    const { world } = state;
    const { radius } = this.stage;
    this.viewTop = view.top;
    this.worldHeight = world.height;
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
    if (!ctx || !layerCtx) return null;

    // The layer covers the view and as much again around it; repainted where the view now is
    // once the camera leaves it, or the pixel ratio changes.
    const layerHeight = world.height * LAYER_VIEWS;
    const outOfLayer =
      view.top < this.layerTop || view.top + world.height > this.layerTop + layerHeight;
    if (pixelRatio !== this.pixelRatio || outOfLayer) {
      if (pixelRatio !== this.pixelRatio) {
        this.pixelRatio = pixelRatio;
        this.sprite = this.createSprite(radius * 2, pixelRatio, this.image);
      }
      this.layerTop = Math.min(0, view.top - (layerHeight - world.height) / 2);
      this.layer.width = pw;
      this.layer.height = Math.max(1, Math.round(layerHeight * pixelRatio));
      layerCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, -this.layerTop * pixelRatio);
      this.stamped = 0;
      this.holes = [];
      this.unstamped = [];
    }
    const xy = state.restingXy;
    for (let k = 0; k < this.holes.length; k += 2) {
      this.repaint(layerCtx, state, this.holes[k]!, this.holes[k + 1]!);
    }
    this.holes = [];
    for (const id of this.unstamped) {
      const slot = state.slotOf(id);
      if (slot !== undefined) this.stamp(layerCtx, xy[2 * slot]!, xy[2 * slot + 1]!);
    }
    this.unstamped = [];
    for (; this.stamped < state.restingCount; this.stamped++) {
      this.stamp(layerCtx, xy[2 * this.stamped]!, xy[2 * this.stamped + 1]!);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(this.layer, 0, Math.round((this.layerTop - view.top) * pixelRatio));
    // Everything else in world pixels, the camera's top at the canvas's.
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, -view.top * pixelRatio);

    const { cur, prev, prevAt, curArrived } = state;
    const { held } = this;
    if (cur) {
      const span = prev ? Math.max(1, cur.time - prev.time) : 1;
      const alpha = prev ? Math.min(1, Math.max(0, (now - curArrived) / span)) : 1;
      const { movingIds, movingXy } = cur;
      for (let k = 0; k < movingIds.length; k++) {
        const id = movingIds[k]!;
        if (held && id === held.id) continue;
        let x = movingXy[2 * k]!;
        let y = movingXy[2 * k + 1]!;
        const before = prev ? prevAt.get(id) : undefined;
        if (prev && before !== undefined && alpha < 1) {
          const px = prev.movingXy[2 * before]!;
          const py = prev.movingXy[2 * before + 1]!;
          x = px + (x - px) * alpha;
          y = py + (y - py) * alpha;
        }
        this.stamp(ctx, x, y);
      }
    }
    return ctx;
  }

  /** Draw the icon the user is holding, on top of everything, into the context `draw` gave. */
  drawHeld(ctx: CanvasRenderingContext2D): void {
    const { held } = this;
    if (held) this.stamp(ctx, held.x, held.y, HELD_SCALE);
  }

  /**
   * An icon left the resting set from `slot`, when `last` was its last slot: `lastId` moved from
   * there to fill it (if it wasn't the last itself), and it was at (x, y). Keeps the layer's
   * bookkeeping as the set's own was kept: the patch it was on is to be repainted if it had been
   * stamped, and one moved down below the stamped mark before its turn still has to be drawn.
   */
  private removeResting(slot: number, last: number, lastId: number, x: number, y: number): void {
    const wasStamped = slot < this.stamped;
    // The slot was filled with the last icon.
    if (slot !== last && slot < this.stamped && last >= this.stamped) this.unstamped.push(lastId);
    if (this.stamped > last) this.stamped = last;
    if (wasStamped) this.holes.push(x, y);
  }

  /**
   * Repaint the layer where an icon was: clear its patch and restamp what overlaps it. The
   * patch is widened to whole device pixels, since clearing and clipping a fractional rect
   * is anti-aliased and would leave faint slivers of the old icon along its edges.
   */
  private repaint(layerCtx: CanvasRenderingContext2D, state: PileState, x: number, y: number) {
    const r = this.stage.radius;
    const pr = this.pixelRatio;
    const x0 = Math.floor((x - r) * pr) / pr;
    const y0 = Math.floor((y - r) * pr) / pr;
    const x1 = Math.ceil((x + r) * pr) / pr;
    const y1 = Math.ceil((y + r) * pr) / pr;
    layerCtx.save();
    layerCtx.beginPath();
    layerCtx.rect(x0, y0, x1 - x0, y1 - y0);
    layerCtx.clip();
    layerCtx.clearRect(x0, y0, x1 - x0, y1 - y0);
    const xy = state.restingXy;
    for (let k = 0; k < this.stamped; k++) {
      const ox = xy[2 * k]!;
      const oy = xy[2 * k + 1]!;
      if (ox + r > x0 && ox - r < x1 && oy + r > y0 && oy - r < y1) this.stamp(layerCtx, ox, oy);
    }
    layerCtx.restore();
  }

  /** Stamp the icon centred at (x, y), in world pixels, `scale` times its size, onto `ctx`: the canvas the last draw gave, or the resting layer. */
  stamp(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
    const r = this.stage.radius * scale;
    // Off the layer (when stamping it) or out of view: part of the pile, but not on screen.
    const [from, to] =
      ctx === this.layer.getContext('2d')
        ? [this.layerTop, this.layerTop + this.worldHeight * LAYER_VIEWS]
        : [this.viewTop, this.viewTop + this.worldHeight];
    if (!this.sprite || y + r < from || y - r > to) return;
    ctx.drawImage(this.sprite, x - r, y - r, 2 * r, 2 * r);
  }
}
