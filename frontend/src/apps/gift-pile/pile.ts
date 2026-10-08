import type { Frame } from './core/protocol';
import type { PileClient } from './pile-client';
import type { CutInRequest, Remover } from './removal/board';
import { type BinTarget, RemovalDirector } from './removal/director';
import type { Ground } from './removal/scoop-board';
import type { Camera, View } from './render/camera';
import type { FrameOffset, Held } from './render/gl-renderer';
import type { Gfx, Quality } from './render/gfx';
import { Shaker } from './render/shake';
import type { ChangeJournal, PileState } from './render/pile-state';
import type { EffectSettings } from './settings';

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
export interface PileDrawing {
  /** Why it can't draw, if it has found it can't. */
  readonly error?: string | null;
  /** Take in what left the resting set, from the state's journal, and empty it. */
  apply(journal: ChangeJournal): void;
  /** The user is holding this icon (or, with null, nothing). */
  hold(held: Held | null): void;
  setImage(image: HTMLImageElement | null): void;
  /** What the effects may cost, from the next frame on. */
  setQuality?(quality: Quality): void;
  /**
   * Start a display frame in `canvas`: draw the pile in `state` as of wall time `now` through
   * `view`, moved by `shake`. Returns what to draw the removals with, or null if there is
   * nothing to draw on.
   */
  begin(
    canvas: HTMLCanvasElement,
    now: number,
    state: PileState,
    view: View,
    shake: FrameOffset,
  ): Gfx | null;
  /** Draw the held icon on top of everything and put the frame on the canvas. */
  end(): void;
}

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
  /** Which showy extras are on; all on, at high quality, by default. */
  effects?: EffectSettings;
  /** The visitor wants less motion: no screen shake or freeze-frames, whatever the effects say. */
  reducedMotion?: boolean;
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
 * - As a removal begins, the view is cut to the pile as it is then, before the removal sees it.
 * - Each display frame (`frame`) steps the camera by how high the heap is and whether a
 *   removal is on, then draws the pile, then the removals, then the icon in the user's hand
 *   (the renderer hands over what to draw the removals with, and puts the frame on screen).
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
  /** What a frame is being drawn with, while it is, for the removals to stamp icons on. */
  private gfx: Gfx | null = null;
  /** The drop line the engine was last told, or null if it has not been since it started over. */
  private dropLine: number | null = null;
  private effects: EffectSettings;
  private readonly reducedMotion: boolean;
  private readonly shaker = new Shaker();
  private readonly cutInListeners = new Set<(request: CutInRequest) => void>();
  /** The wall time of the frame being drawn, which the shake counts from. */
  private frameNow = 0;

  constructor({
    client,
    state,
    camera,
    renderer,
    removers,
    radius,
    rng,
    loadGiftImage = () => Promise.resolve(null),
    effects = { cutIns: true, shake: true, quality: 'high' },
    reducedMotion = false,
  }: Options) {
    this.client = client;
    this.state = state;
    this.camera = camera;
    this.renderer = renderer;
    this.removers = removers;
    this.radius = radius;
    this.loadGiftImage = loadGiftImage;
    this.effects = effects;
    this.reducedMotion = reducedMotion;
    renderer.setQuality?.(effects.quality);
    this.removerNames = removers.map((remover) => remover.name);
    const ground: Ground = {
      radius,
      topAt: (x) => state.topAt(x),
      peek: (id) => state.peek(id),
      take: (id) => this.take(id),
      stamp: (x, y, scale) => this.gfx?.icon(x, y, scale),
      camera: {
        get view() {
          return camera.view;
        },
        moveTo: (top) => camera.moveTo(top),
      },
      fx: {
        shake: (amplitude, ms) => this.shaker.add(amplitude, ms, this.frameNow),
        cutIn: (request) => {
          for (const fn of this.cutInListeners) fn(request);
        },
      },
    };
    this.director = new RemovalDirector(client, { ground, removers, ...(rng && { rng }) });
    this.director.setMotion(this.motion);
  }

  /** Start the physics worker, if it isn't running. */
  start(): void {
    this.client.start();
  }

  /** Stop the physics worker; the pile is gone with it. */
  stop(): void {
    this.client.stop();
  }

  /** The effects as chosen, for the page to show. */
  get effectSettings(): EffectSettings {
    return this.effects;
  }

  /** Turn the showy extras on or off, and change what they may cost, from now on. */
  setEffects(effects: EffectSettings): void {
    this.effects = effects;
    this.renderer.setQuality?.(effects.quality);
    this.director.setMotion(this.motion);
    if (!this.motion.shake) this.shaker.clear();
  }

  /**
   * What the extras may do now: the chosen ones, less the shake and the freeze-frame that
   * come with a cut-in if the visitor wants less motion.
   */
  get motion(): { cutIns: boolean; shake: boolean; hitStop: boolean } {
    const { cutIns, shake } = this.effects;
    return { cutIns, shake: shake && !this.reducedMotion, hitStop: cutIns && !this.reducedMotion };
  }

  /** Set if the renderer can't draw (no WebGL2, say), with its message; the canvas then stays empty. */
  get rendererError(): string | null {
    return this.renderer.error ?? null;
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

  /** Call `fn` with each cut-in a removal brings on (the banner is the page's to show); the function returned stops that. */
  onCutIn(fn: (request: CutInRequest) => void): () => void {
    this.cutInListeners.add(fn);
    return () => void this.cutInListeners.delete(fn);
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
    // A removal is about to begin: first cut the view to the pile as it now is, since what went
    // at once in the same tick (over a load) may have lowered it far, and the removal works out
    // where it comes and goes from the view it starts with. The cut and the vanishing are the
    // same frame, so they read as one.
    if (frame.scooped.some((scoop) => scoop.ids.length > 0) && !director.busy) {
      camera.frame(state.highestTop(this.dropLine));
    }
    for (const scoop of frame.scooped) director.onScoop(scoop, state.world, now);
  }

  /** Draw a display frame into `canvas`, as of wall time `now` (ms). */
  frame(canvas: HTMLCanvasElement, now: number): void {
    const { state, camera, director, renderer } = this;
    const view = camera.step({ now, top: state.highestTop(this.dropLine), busy: director.busy });
    this.sendDropLine();
    this.frameNow = now;
    const gfx = renderer.begin(canvas, now, state, view, this.shaker.at(now));
    if (!gfx) return;
    this.gfx = gfx;
    director.draw(gfx, now);
    renderer.end();
    this.gfx = null;
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
