import type { Scoop } from '../core/protocol';
import type { Hooks } from '../render/overlay';
import type { Board, Point, World } from './board';
import type { RemovalSink } from './sink';

/** Where a removal's icon is. */
const IN_PILE = 0; // drawn by the renderer
const TAKEN = 1; // grabbed, the removal's to draw
const DROPPED = 2; // let go, the engine's again
const GONE = 3; // destroyed
/** An icon's radius until the renderer has said. */
const DEFAULT_RADIUS = 8;

/**
 * The pile's side of a `Board`, for the icons of one scoop: it passes the removal's asks on
 * to the engine (through the sink) and the renderer (through the frame's hooks), and keeps
 * the books, so each icon is grabbed before it moves and is in the end released or
 * destroyed. `frame` hands it each frame's hooks before the removal draws.
 */
export class ScoopBoard implements Board {
  readonly icons: readonly Point[];
  readonly dropCount: number;
  private readonly ids: Int32Array;
  private readonly index = new Map<number, number>();
  private readonly state: Uint8Array;
  private hooks: Hooks | null = null;

  constructor(
    private readonly sink: RemovalSink,
    scoop: Scoop,
    readonly world: World,
    /** Called with each icon dropped back. */
    private readonly onDrop: (id: number) => void,
  ) {
    this.ids = scoop.ids;
    this.state = new Uint8Array(scoop.ids.length);
    this.dropCount = Math.min(scoop.drop, scoop.ids.length);
    this.icons = Array.from(scoop.ids, (id, i) => {
      this.index.set(id, i);
      return { x: scoop.xy[2 * i]!, y: scoop.xy[2 * i + 1]! };
    });
  }

  get iconRadius(): number {
    return this.hooks?.radius ?? DEFAULT_RADIUS;
  }

  /** The renderer's hooks for the frame about to be drawn. */
  frame(hooks: Hooks): void {
    this.hooks = hooks;
  }

  /** Icon `id` is this board's, taken or about to be, so the user can't pick it up. */
  holds(id: number): boolean {
    const i = this.index.get(id);
    return i !== undefined && this.state[i]! <= TAKEN;
  }

  topAt(x: number): number | null {
    return this.hooks?.top(x) ?? null;
  }

  where(i: number): Point | null {
    if (this.state[i]! > TAKEN) return null;
    const at = this.hooks?.peek(this.ids[i]!);
    return at ? { x: at.x, y: at.y } : null;
  }

  take(i: number): Point | null {
    if (this.state[i] !== IN_PILE) return null;
    const id = this.ids[i]!;
    const at = this.hooks?.take(id) ?? null;
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
    this.hooks?.stamp(x, y, scale);
  }

  /** The removal is over: destroy every icon it hasn't dropped or destroyed already. */
  finish(): void {
    for (let i = 0; i < this.ids.length; i++) this.destroy(i);
  }
}
