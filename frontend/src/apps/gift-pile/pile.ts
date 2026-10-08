import type { Frame } from './core/protocol';
import type { PileClient } from './pile-client';
import type { Remover } from './removal/board';
import { type BinTarget, RemovalDirector } from './removal/director';
import type { Ground } from './removal/scoop-board';
import type { Camera, View } from './render/camera';
import type { PileState } from './render/pile-state';
import type { PileRenderer } from './render/renderer';

/** What the pile asks of the worker's client. */
export type PileLink = Pick<
  PileClient,
  | 'start'
  | 'stop'
  | 'stats'
  | 'error'
  | 'alive'
  | 'add'
  | 'remove'
  | 'scoop'
  | 'clear'
  | 'resize'
  | 'grab'
  | 'release'
  | 'destroy'
  | 'setDropLine'
>;

/** What the pile asks of the renderer. */
export type PileDrawing = Pick<
  PileRenderer,
  'apply' | 'draw' | 'drawHeld' | 'hold' | 'stamp' | 'setImage'
>;

interface Options {
  client: PileLink;
  state: PileState;
  camera: Camera;
  renderer: PileDrawing;
  /** The removers to deal from, at least one. */
  removers: readonly Remover[];
  /** An icon's drawn radius, in world pixels. */
  radius: number;
  /** Random numbers in [0, 1) for the removals. */
  rng?: () => number;
  /** Fetches the gift image; null if it fails, and the drawn stand-in stays. */
  loadGiftImage?: () => Promise<HTMLImageElement | null>;
}

/** What the page shows of the pile's count. */
export interface PileCounts {
  /** Icons in the world, moving or at rest. */
  total: number;
  moving: number;
  /** Asked for but not yet released, or waiting on a removal to be over. */
  queued: number;
}

/**
 * The one thing the page talks to. It owns the worker's client, the state of where every
 * icon is, the camera, the renderer and the removals' director, and is the only place that
 * knows about more than one of them: the camera, the engine and the renderer never refer to
 * each other, and the pile passes what each needs from the others between them.
 *
 * - A frame from the worker is taken in on its message (`onFrame`), not at the next draw,
 *   because the renderer interpolates by when the latest one arrived. It goes into the state,
 *   and what left the resting set into the renderer's layer; a new generation first resets the
 *   director and the camera; the scoops it brought go to the director.
 * - Each display frame (`frame`) steps the camera by how high the heap is and whether a
 *   removal is on, then draws the pile, then the removals, then the icon in the user's hand.
 * - The engine is told where to release new icons, just above the camera's target view,
 *   whenever that changes.
 * - A removal's board asks the pile about icons, drawing and the camera through the ground
 *   the pile makes for it.
 */
export class Pile {
  readonly client: PileLink;
  readonly renderer: PileDrawing;
  /** The removers the director deals from, by name, to turn on and off. */
  readonly removerNames: string[];

  private readonly state: PileState;
  private readonly camera: Camera;
  private readonly director: RemovalDirector;
  private readonly removers: readonly Remover[];
  private readonly radius: number;
  private readonly loadGiftImage: () => Promise<HTMLImageElement | null>;
  /** The canvas's context while a frame is being drawn, for the removals to stamp on. */
  private ctx: CanvasRenderingContext2D | null = null;
  /** The drop line the engine was last told, or null if it has not been since it started over. */
  private dropLine: number | null = null;

  constructor({
    client,
    state,
    camera,
    renderer,
    removers,
    radius,
    rng,
    loadGiftImage = () => Promise.resolve(null),
  }: Options) {
    this.client = client;
    this.state = state;
    this.camera = camera;
    this.renderer = renderer;
    this.removers = removers;
    this.radius = radius;
    this.loadGiftImage = loadGiftImage;
    this.removerNames = removers.map((remover) => remover.name);
    const ground: Ground = {
      radius,
      topAt: (x) => state.topAt(x),
      peek: (id) => state.peek(id),
      take: (id) => this.take(id),
      stamp: (x, y, scale) => {
        if (this.ctx) renderer.stamp(this.ctx, x, y, scale);
      },
      camera: {
        get view() {
          return camera.view;
        },
        moveTo: (top) => camera.moveTo(top),
      },
    };
    this.director = new RemovalDirector(client, { ground, removers, ...(rng && { rng }) });
  }

  /** Start the physics worker, if it isn't running. */
  start(): void {
    this.client.start();
  }

  /** Stop the physics worker; the pile is gone with it. */
  stop(): void {
    this.client.stop();
  }

  /** Set if the worker failed, with its message; the canvas then stays empty. */
  get error(): string | null {
    return this.client.error;
  }

  /** The icons in the world as of the latest frame, and those still to come. */
  counts(): PileCounts {
    const { total, moving, queued } = this.client.stats;
    return { total, moving, queued: queued + this.director.pendingAdds };
  }

  /** Add `count` icons, at wall time `now`: at once, or after any removal under way. */
  add(count: number, now: number): void {
    this.director.add(count, now);
  }

  /** Remove `count` icons, at wall time `now`, when their turn comes. */
  remove(count: number, now: number): void {
    this.director.remove(count, now);
  }

  /** Empty the pile. */
  clear(): void {
    this.client.clear();
  }

  /** A new world of this play-area size, in pixels; the pile is emptied with it. */
  resize(width: number, height: number): void {
    this.client.resize(width, height);
  }

  /** Deal only the removers named, from the next removal on. */
  setEnabled(names: ReadonlySet<string>): void {
    this.director.setEnabled(names);
  }

  /** Where the bin is, in world pixels, for catching dropped icons; null while there is none. */
  setBin(bin: BinTarget | null): void {
    this.director.setBin(bin);
  }

  /** The part of the world on screen now. */
  get view(): View {
    return this.camera.view;
  }

  /** Call `fn` with the view's new top each time it moves; the function returned stops that. */
  onCamera(fn: (top: number) => void): () => void {
    return this.camera.subscribe(fn);
  }

  /** The world position of (x, y) on the canvas, which shows the view: both in world pixels. */
  toWorld(x: number, y: number): { x: number; y: number } {
    return { x, y: y + this.camera.view.top };
  }

  /** The icon to pick up at world position (x, y), if any, other than one a removal has. */
  iconAt(x: number, y: number): number | null {
    return this.state.iconAt(x, y, (id) => this.director.holds(id));
  }

  /** The user picks icon `id` up at world position (x, y): it leaves the pile and is drawn there. */
  grab(id: number, x: number, y: number): void {
    this.client.grab(id);
    this.renderer.hold({ id, x, y });
  }

  /** The user moves the icon in their hand. */
  move(id: number, x: number, y: number): void {
    this.renderer.hold({ id, x, y });
  }

  /** The user lets the icon in their hand go at world position (x, y): it falls from there. */
  release(id: number, x: number, y: number): void {
    this.client.release(id, x, y);
    this.renderer.hold(null);
  }

  /** The user drops the icon in their hand in the bin. */
  destroy(id: number): void {
    this.client.destroy(id);
    this.renderer.hold(null);
  }

  /**
   * Loads the gift image and the removers' art and hands them over; the gift's drawn
   * stand-in shows until then. Returns a function that stops the hand-over, for when the
   * page goes away first.
   */
  loadImages(): () => void {
    let wanted = true;
    void this.loadGiftImage().then((image) => {
      if (wanted) this.renderer.setImage(image);
    });
    // The removers keep their images whether or not the page is still here.
    for (const remover of this.removers) void remover.load?.();
    return () => {
      wanted = false;
    };
  }

  /** Take in a frame from the worker, which arrived at wall time `now` (ms). */
  onFrame(frame: Frame, now: number): void {
    const { state, camera, director } = this;
    // A new generation: the engine has let everything go, so the removals and the view
    // start over before this frame's icons are taken in.
    if (state.isNewGeneration(frame)) {
      director.reset();
      camera.reset();
      this.dropLine = null;
    }
    state.apply(frame, now);
    camera.setHeight(state.world.height);
    this.renderer.apply(state.journal);
    for (const scoop of frame.scooped) director.onScoop(scoop, state.world, now);
  }

  /** Draw a display frame into `canvas`, as of wall time `now` (ms). */
  frame(canvas: HTMLCanvasElement, now: number): void {
    const { state, camera, director, renderer } = this;
    const view = camera.step({ now, top: state.highestTop(this.dropLine), busy: director.busy });
    this.sendDropLine();
    const ctx = renderer.draw(canvas, now, state, view);
    if (!ctx) return;
    this.ctx = ctx;
    director.draw(ctx, now);
    renderer.drawHeld(ctx);
    this.ctx = null;
  }

  /**
   * Tell the engine to release new icons just above where the view is heading, with an
   * icon's radius to spare, so they don't show half on screen while it eases there. Only when
   * that has changed.
   */
  private sendDropLine(): void {
    // Whole pixels, so a heap settling doesn't send the engine a new line nearly every frame.
    const line = Math.round(this.camera.target - this.radius);
    if (line === this.dropLine) return;
    this.dropLine = line;
    this.client.setDropLine(line);
  }

  /** A removal takes icon `id` out of the pile: where it was, and off the renderer's layer if it was on. */
  private take(id: number): { x: number; y: number } | null {
    const at = this.state.take(id);
    this.renderer.apply(this.state.journal);
    return at;
  }
}
