import type { Scoop } from '../core/protocol';
import {
  type Board,
  type Camera,
  type CutInRequest,
  type Fx,
  NO_FX,
  type Point,
  topKeeping,
  type View,
  type World,
} from './board';
import type { RemovalSink } from './sink';

/** Where a removal's icon is. */
const IN_PILE = 0; // drawn by the renderer
const TAKEN = 1; // grabbed, the removal's to draw
const DROPPED = 2; // let go, the engine's again
const GONE = 3; // destroyed

/**
 * What a removal's board asks of the pile it works over, besides the engine's commands:
 * where things are and how to draw them. The `Pile` answers, from its state, its renderer
 * and its camera.
 */
export interface Ground {
  /** An icon's drawn radius, in world pixels. */
  readonly radius: number;
  /** The top of the pile at world x, by the middle of the highest icon there; null if there are none. */
  topAt(x: number): number | null;
  /** Where icon `id` is now and whether it is at rest, or null if the pile doesn't have it. */
  peek(id: number): { x: number; y: number; resting: boolean } | null;
  /**
   * Where icon `id` is now, in world pixels, or null if the pile doesn't have it; the pile
   * stops drawing it from here on, as the removal takes over.
   */
  take(id: number): { x: number; y: number } | null;
  /** Stamp the icon sprite centred at (x, y), in world pixels, at `scale` times its size, on this frame. */
  stamp(x: number, y: number, scale?: number): void;
  /** The view onto the pile, and moving it (which holds until the removal is over). */
  readonly camera: { readonly view: View; moveTo(top: number): void };
  /** The screen's side of the showy extras; a ground without them has none. */
  readonly fx?: {
    shake(amplitude: number, ms: number): void;
    cutIn(request: CutInRequest): void;
  };
}

/**
 * The pile's side of a `Board`, for the icons of one scoop: it passes the removal's asks on
 * to the engine (through the sink) and the pile (through its ground), and keeps the books,
 * so each icon is grabbed before it moves and is in the end released or destroyed.
 */
export class ScoopBoard implements Board {
  readonly icons: readonly Point[];
  readonly dropCount: number;
  private readonly ids: Int32Array;
  private readonly index = new Map<number, number>();
  private readonly state: Uint8Array;

  constructor(
    private readonly sink: RemovalSink,
    private readonly ground: Ground,
    scoop: Scoop,
    readonly world: World,
    /** Called with each icon dropped back. */
    private readonly onDrop: (id: number) => void,
    /** Shake, freeze-frame and cut-in, as the director sets them up. */
    readonly fx: Fx = NO_FX,
  ) {
    this.ids = scoop.ids;
    this.state = new Uint8Array(scoop.ids.length);
    this.dropCount = Math.min(scoop.drop, scoop.ids.length);
    this.icons = Array.from(scoop.ids, (id, i) => {
      this.index.set(id, i);
      return { x: scoop.xy[2 * i]!, y: scoop.xy[2 * i + 1]! };
    });
    const { camera } = ground;
    this.camera = {
      get view() {
        return camera.view;
      },
      moveTo(top) {
        camera.moveTo(top);
      },
      keepInView(y, margin) {
        const top = topKeeping(this.view, y, margin);
        if (top !== this.view.top) this.moveTo(top);
      },
    };
  }

  /** The pile's camera. */
  readonly camera: Camera;

  get iconRadius(): number {
    return this.ground.radius;
  }

  /** Icon `id` is this board's, taken or about to be, so the user can't pick it up. */
  holds(id: number): boolean {
    const i = this.index.get(id);
    return i !== undefined && this.state[i]! <= TAKEN;
  }

  topAt(x: number): number | null {
    return this.ground.topAt(x);
  }

  where(i: number): Point | null {
    if (this.state[i]! > TAKEN) return null;
    const at = this.ground.peek(this.ids[i]!);
    return at ? { x: at.x, y: at.y } : null;
  }

  take(i: number): Point | null {
    if (this.state[i] !== IN_PILE) return null;
    const id = this.ids[i]!;
    const at = this.ground.take(id);
    this.sink.grab(id);
    this.state[i] = TAKEN;
    return at;
  }

  drop(i: number, x: number, y: number, vx?: number, vy?: number): void {
    if (this.state[i]! > TAKEN) return;
    this.take(i);
    const id = this.ids[i]!;
    this.state[i] = DROPPED;
    this.sink.release(id, x, y, vx, vy);
    this.onDrop(id);
  }

  destroy(i: number): void {
    if (this.state[i]! > TAKEN) return;
    this.take(i);
    this.state[i] = GONE;
    this.sink.destroy(this.ids[i]!);
  }

  stamp(x: number, y: number, scale?: number): void {
    this.ground.stamp(x, y, scale);
  }

  /** The removal is over: destroy every icon it hasn't dropped or destroyed already. */
  finish(): void {
    for (let i = 0; i < this.ids.length; i++) this.destroy(i);
  }
}
