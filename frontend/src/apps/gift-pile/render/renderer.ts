import type { PileSettings } from '../core/config';
import type { Frame } from '../core/protocol';
import type { Overlay } from './overlay';
import { createGiftSprite } from './sprite';

/** Makes the icon image at a pixel ratio from the gift image, or without one; a test can return anything. */
export type CreateSprite = (
  size: number,
  pixelRatio: number,
  image: HTMLImageElement | null,
) => CanvasImageSource;

type Stage = Pick<PileSettings, 'world' | 'radius' | 'grabRadius'>;

/** An icon the user is holding, and where (pixels). */
export interface Held {
  id: number;
  x: number;
  y: number;
}

/** A held icon is drawn this much bigger, as if lifted towards the viewer. */
const HELD_SCALE = 1.2;

/**
 * Draws the pile from the frames the physics worker posts, in two layers. Icons at rest are
 * stamped once onto an offscreen canvas as they settle, so a frame copies that one image and
 * then stamps only the moving icons. Each draw costs by what's moving, however big the pile.
 * When an icon leaves the pile, only its patch of the layer is repainted.
 *
 * Frames arrive at the physics rate and draws happen at the display rate, so a moving icon
 * is drawn between where the last two frames put it, by how long ago the latest arrived.
 * Icons the worker has scooped for removal are handed to the overlay (the removals), which
 * draws each from the moment it takes it.
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

  // Every resting icon, in order of settling: index and position, with each icon's slot,
  // and how many slots are on the layer so far.
  private restingIds = new Int32Array(4096);
  private restingXy = new Float32Array(8192);
  private restingCount = 0;
  private readonly slotOf = new Map<number, number>();
  private stamped = 0;
  // Patches of the layer to repaint: an icon left from there.
  private holes: { x: number; y: number }[] = [];
  // Icons moved below the stamped mark to fill a gap before their turn, so not yet drawn.
  // By icon, since more removals can move them again before the next draw.
  private unstamped: number[] = [];

  // The latest two frames, for interpolation; `prevAt` and `curAt` map an icon to its place in each.
  private prev: Frame | null = null;
  private cur: Frame | null = null;
  private curArrived = 0;
  private readonly prevAt = new Map<number, number>();
  private readonly curAt = new Map<number, number>();

  /** The icon the user is holding, drawn on top of the rest. */
  private held: Held | null = null;

  /** The user is holding this icon here, or (null) nothing. */
  hold(held: Held | null): void {
    this.held = held;
  }

  // The canvas's size: the stage's until the first frame says otherwise.
  private world: Stage['world'];

  constructor(
    private readonly stage: Stage,
    private readonly createSprite: CreateSprite = createGiftSprite,
    /** Carries scooped icons away; without one they just vanish. */
    private readonly overlay: Overlay | null = null,
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
      this.slotOf.clear();
      this.holes = [];
      this.unstamped = [];
      this.stamped = 0;
      this.pixelRatio = 0;
      this.prev = null;
      this.overlay?.reset();
    } else {
      this.prev = this.cur;
    }
    this.prevAt.clear();
    if (this.prev) this.prev.movingIds.forEach((id, k) => this.prevAt.set(id, k));
    this.curAt.clear();
    frame.movingIds.forEach((id, k) => this.curAt.set(id, k));
    this.cur = frame;
    this.curArrived = now;

    // Settled before woken: an icon can do both within one tick (a cascade wakes one that
    // has just come to rest), and must end up off the layer.
    const need = this.restingCount + frame.settledIds.length;
    if (need > this.restingIds.length) {
      const size = Math.max(need, this.restingIds.length * 2);
      const ids = new Int32Array(size);
      ids.set(this.restingIds);
      this.restingIds = ids;
      const xy = new Float32Array(size * 2);
      xy.set(this.restingXy);
      this.restingXy = xy;
    }
    frame.settledIds.forEach((id, k) => this.slotOf.set(id, this.restingCount + k));
    this.restingIds.set(frame.settledIds, this.restingCount);
    this.restingXy.set(frame.settledXy, this.restingCount * 2);
    this.restingCount += frame.settledIds.length;
    frame.wokenIds.forEach((id) => this.removeResting(id));
    for (const scoop of frame.scooped) this.overlay?.onScoop(scoop, this.world, now);
  }

  /**
   * The icon to pick up at world position (x, y), if any: the nearest within `grabRadius`,
   * a moving one first (they are drawn on top), else a resting one.
   */
  iconAt(x: number, y: number): number | null {
    const r = this.stage.grabRadius;
    const r2 = r * r;
    let best: number | null = null;
    let bestD2 = r2;
    const { cur, overlay } = this;
    if (cur) {
      for (let k = 0; k < cur.movingIds.length; k++) {
        const dx = cur.movingXy[2 * k]! - x;
        const dy = cur.movingXy[2 * k + 1]! - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2 && !overlay?.holds(cur.movingIds[k]!)) {
          bestD2 = d2;
          best = cur.movingIds[k]!;
        }
      }
      if (best !== null) return best;
    }
    for (let k = 0; k < this.restingCount; k++) {
      const dx = this.restingXy[2 * k]! - x;
      const dy = this.restingXy[2 * k + 1]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2 && !overlay?.holds(this.restingIds[k]!)) {
        bestD2 = d2;
        best = this.restingIds[k]!;
      }
    }
    return best;
  }

  /** Where icon `id` is, at rest or as of the latest frame; null if it isn't here. */
  private peek(id: number): { x: number; y: number; resting: boolean } | null {
    const slot = this.slotOf.get(id);
    if (slot !== undefined) {
      return { x: this.restingXy[2 * slot]!, y: this.restingXy[2 * slot + 1]!, resting: true };
    }
    const k = this.curAt.get(id);
    const { cur } = this;
    if (cur && k !== undefined) {
      return { x: cur.movingXy[2 * k]!, y: cur.movingXy[2 * k + 1]!, resting: false };
    }
    return null;
  }

  /**
   * The overlay takes icon `id`: where it is now, and off the resting layer if it was there
   * (the engine's frame will say the same a tick later). Null if it isn't here.
   */
  private take(id: number): { x: number; y: number } | null {
    const at = this.peek(id);
    if (at?.resting) this.removeResting(id);
    return at;
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
      this.holes = [];
      this.unstamped = [];
    }
    for (const hole of this.holes) this.repaint(layerCtx, hole.x, hole.y);
    this.holes = [];
    for (const id of this.unstamped) {
      const slot = this.slotOf.get(id);
      if (slot !== undefined) {
        this.stamp(layerCtx, this.restingXy[2 * slot]!, this.restingXy[2 * slot + 1]!);
      }
    }
    this.unstamped = [];
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

    const { cur, prev, held } = this;
    if (cur) {
      const span = prev ? Math.max(1, cur.time - prev.time) : 1;
      const alpha = prev ? Math.min(1, Math.max(0, (now - this.curArrived) / span)) : 1;
      const { movingIds, movingXy } = cur;
      for (let k = 0; k < movingIds.length; k++) {
        const id = movingIds[k]!;
        if (held && id === held.id) continue;
        let x = movingXy[2 * k]!;
        let y = movingXy[2 * k + 1]!;
        const before = prev ? this.prevAt.get(id) : undefined;
        if (prev && before !== undefined && alpha < 1) {
          const px = prev.movingXy[2 * before]!;
          const py = prev.movingXy[2 * before + 1]!;
          x = px + (x - px) * alpha;
          y = py + (y - py) * alpha;
        }
        this.stamp(ctx, x, y);
      }
    }
    this.overlay?.draw(ctx, now, {
      radius: this.stage.radius,
      stamp: (x, y, scale) => this.stamp(ctx, x, y, scale),
      take: (id) => this.take(id),
      peek: (id) => this.peek(id),
    });
    if (held) this.stamp(ctx, held.x, held.y, HELD_SCALE);
  }

  /** Icon `id` is no longer at rest: out of the list, and its patch of the layer repainted. */
  private removeResting(id: number): void {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return;
    const x = this.restingXy[2 * slot]!;
    const y = this.restingXy[2 * slot + 1]!;
    const wasStamped = slot < this.stamped;
    // Fill the slot with the last icon.
    const last = this.restingCount - 1;
    if (slot !== last) {
      const lastId = this.restingIds[last]!;
      this.restingIds[slot] = lastId;
      this.restingXy[2 * slot] = this.restingXy[2 * last]!;
      this.restingXy[2 * slot + 1] = this.restingXy[2 * last + 1]!;
      this.slotOf.set(lastId, slot);
      // Moved below the stamped mark before its turn: it still has to be drawn.
      if (slot < this.stamped && last >= this.stamped) this.unstamped.push(lastId);
    }
    this.slotOf.delete(id);
    this.restingCount = last;
    if (this.stamped > last) this.stamped = last;
    if (wasStamped) this.holes.push({ x, y });
  }

  /**
   * Repaint the layer where an icon was: clear its patch and restamp what overlaps it. The
   * patch is widened to whole device pixels, since clearing and clipping a fractional rect
   * is anti-aliased and would leave faint slivers of the old icon along its edges.
   */
  private repaint(layerCtx: CanvasRenderingContext2D, x: number, y: number): void {
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
    for (let k = 0; k < this.stamped; k++) {
      const ox = this.restingXy[2 * k]!;
      const oy = this.restingXy[2 * k + 1]!;
      if (ox + r > x0 && ox - r < x1 && oy + r > y0 && oy - r < y1) this.stamp(layerCtx, ox, oy);
    }
    layerCtx.restore();
  }

  private stamp(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
    const r = this.stage.radius * scale;
    // Above the top edge: part of the pile, but not on screen.
    if (!this.sprite || y + r < 0) return;
    ctx.drawImage(this.sprite, x - r, y - r, 2 * r, 2 * r);
  }
}
