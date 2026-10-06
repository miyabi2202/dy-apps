import type RAPIER from '@dimforge/rapier2d-compat';
import { PILE, type PileSettings } from './config';

/** The Rapier module, initialised (`await RAPIER.init()`) before it is handed over. */
export type Rapier = typeof RAPIER;

/** Random numbers in [0, 1); `Math.random` unless a test passes its own. */
export type Rng = () => number;

interface Options {
  rapier: Rapier;
  settings?: PileSettings;
  rng?: Rng;
}

/** Tries to find a clear spot for a new icon before leaving it queued for the next step. */
const SPAWN_TRIES = 10;

/**
 * The pile, simulated by Rapier. Every icon is a circle in a world with a floor and two
 * walls. New icons are released on a line above the pile and fall as rigid bodies that
 * don't bounce but do rub against each other, so they slide down the heap until it holds
 * them. Once one has been near enough to still for a while it comes to rest: its body is
 * taken out of the engine and a fixed circle is left in its place for the others to land on.
 * So the engine only ever simulates what is moving, however big the pile.
 *
 * Positions are kept in pixels in typed arrays indexed by icon, sized for `maxItems` up
 * front; the engine itself works in metres (see `pxPerMetre`).
 */
export class PileEngine {
  readonly width: number;
  readonly height: number;
  /** The collision radius; the icon is drawn bigger than this. */
  readonly radius: number;
  readonly maxItems: number;

  /** Every icon's position, in pixels: live for moving ones, final for resting ones. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** 1 once an icon has come to rest. */
  readonly resting: Uint8Array;

  /** Icons in the world so far (indices `0 … count - 1`). */
  count = 0;
  /** Asked for but not yet released. */
  queued = 0;
  /** The top of the resting pile: the highest resting icon's centre, or the floor. */
  topY: number;
  /** Goes up on every `clear()`, so a renderer knows to start its pile over. */
  generation = 0;

  private readonly rapier: Rapier;
  private readonly settings: PileSettings;
  private readonly rng: Rng;
  private readonly scale: number;
  private readonly dt: number;

  private world: RAPIER.World;
  private readonly bodies: (RAPIER.RigidBody | null)[];
  // Moving icons, in release order.
  private readonly moving: Int32Array;
  private movingLen = 0;
  /** Steps a moving icon has been slower than `settle.speed`, capped at 255. */
  private readonly still: Uint8Array;
  /** The step each icon was released on. */
  private readonly born: Int32Array;
  private stepCount = 0;
  private spawnCredit = 0;

  // Icons that came to rest since the last drain, for the renderer's static layer.
  private readonly settledBuf: Int32Array;
  private settledLen = 0;

  constructor({ rapier, settings = PILE, rng = Math.random }: Options) {
    this.rapier = rapier;
    this.settings = settings;
    this.rng = rng;
    this.width = settings.world.width;
    this.height = settings.world.height;
    this.radius = settings.collisionRadius;
    this.maxItems = settings.maxItems;
    this.scale = 1 / settings.pxPerMetre;
    this.dt = 1 / settings.stepHz;
    this.topY = this.height;

    const n = this.maxItems;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.resting = new Uint8Array(n);
    this.bodies = new Array<RAPIER.RigidBody | null>(n).fill(null);
    this.moving = new Int32Array(n);
    this.still = new Uint8Array(n);
    this.born = new Int32Array(n);
    this.settledBuf = new Int32Array(n);
    this.world = this.createWorld();
  }

  /** Icons still moving. */
  get movingCount(): number {
    return this.movingLen;
  }

  /** Queue `n` more icons; they're released over the next steps. Returns how many fit. */
  add(n: number): number {
    const room = this.maxItems - this.count - this.queued;
    const added = Math.max(0, Math.min(Math.floor(n), room));
    this.queued += added;
    return added;
  }

  /** Back to an empty world. */
  clear(): void {
    this.world.free();
    this.world = this.createWorld();
    this.bodies.fill(null);
    this.count = 0;
    this.queued = 0;
    this.movingLen = 0;
    this.settledLen = 0;
    this.spawnCredit = 0;
    this.stepCount = 0;
    this.topY = this.height;
    this.resting.fill(0);
    this.generation++;
  }

  /** Frees the engine's memory; the instance is unusable afterwards. */
  free(): void {
    this.world.free();
  }

  /** Hands over every icon that came to rest since the last call. */
  drainSettled(fn: (index: number) => void): void {
    for (let k = 0; k < this.settledLen; k++) fn(this.settledBuf[k]!);
    this.settledLen = 0;
  }

  /** Calls `fn` for each moving icon. */
  forEachMoving(fn: (index: number) => void): void {
    for (let k = 0; k < this.movingLen; k++) fn(this.moving[k]!);
  }

  /** Advance by one step of `1 / stepHz` seconds. */
  step(): void {
    this.stepCount++;
    this.spawn();
    this.world.step();
    this.settle();
  }

  /** A world with the floor and walls in it, in metres. */
  private createWorld(): RAPIER.World {
    const { rapier: R, settings, scale } = this;
    const world = new R.World({ x: 0, y: settings.gravity * scale });
    world.timestep = this.dt;
    world.integrationParameters.contact_natural_frequency = settings.contactHz;
    const w = this.width * scale;
    const h = this.height * scale;
    // Thick slabs, so nothing gets through them; the walls run far up for a tall pile.
    const thick = 50 * scale;
    const tall = 100_000 * scale;
    const wall = (x: number) =>
      world.createCollider(
        R.ColliderDesc.cuboid(thick, tall).setTranslation(x, 0).setFriction(settings.friction),
      );
    world.createCollider(
      R.ColliderDesc.cuboid(w / 2 + thick, thick)
        .setTranslation(w / 2, h + thick)
        .setFriction(settings.friction),
    );
    wall(-thick);
    wall(w + thick);
    return world;
  }

  /**
   * Release what the rate allows on the line above the heap, each clear of every moving
   * icon near the line. The heap is what rests plus whatever has been in the world for a
   * while; the fresh stream above it doesn't push the line up.
   */
  private spawn(): void {
    const { settings: s, rapier: R, scale, x, y, moving } = this;
    this.spawnCredit += s.spawnPerSecond * this.dt;
    const n = Math.min(Math.floor(this.spawnCredit), this.queued, this.maxItems - this.count);
    if (n <= 0) return;
    const r = this.radius;
    const d = 2 * r;
    const d2 = d * d;

    let top = this.topY;
    const heapBorn = this.stepCount - s.heapAge;
    for (let k = 0; k < this.movingLen; k++) {
      const i = moving[k]!;
      if (this.born[i]! <= heapBorn && y[i]! < top) top = y[i]!;
    }
    const line = Math.min(-r, top - d);
    // Icons are spread over the distance the stream falls in one step, so a step's
    // releases don't form a row.
    const band = s.spawnSpeed * this.dt;
    // Moving icons near the line, to keep clear of; new ones join as they are released.
    const nearX: number[] = [];
    const nearY: number[] = [];
    for (let k = 0; k < this.movingLen; k++) {
      const i = moving[k]!;
      if (y[i]! < line + d && y[i]! > line - band - d) {
        nearX.push(x[i]!);
        nearY.push(y[i]!);
      }
    }

    let released = 0;
    while (released < n) {
      let px = 0;
      let py = 0;
      let clear = false;
      for (let attempt = 0; attempt < SPAWN_TRIES && !clear; attempt++) {
        px = r + this.rng() * (this.width - d);
        py = line - this.rng() * band;
        clear = true;
        for (let k = 0; k < nearX.length; k++) {
          const dx = px - nearX[k]!;
          const dy = py - nearY[k]!;
          if (dx * dx + dy * dy < d2) {
            clear = false;
            break;
          }
        }
      }
      // The line is crowded: leave the rest queued for the next step.
      if (!clear) break;
      const i = this.count++;
      x[i] = px;
      y[i] = py;
      this.resting[i] = 0;
      this.still[i] = 0;
      this.born[i] = this.stepCount;
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(px * scale, py * scale)
          .setLinvel(0, s.spawnSpeed * scale)
          .setCcdEnabled(true),
      );
      this.world.createCollider(
        R.ColliderDesc.ball(r * scale)
          .setRestitution(0)
          .setFriction(s.friction),
        body,
      );
      this.bodies[i] = body;
      moving[this.movingLen++] = i;
      nearX.push(px);
      nearY.push(py);
      released++;
    }
    this.spawnCredit -= released;
    this.queued -= released;
  }

  /** Read back where the moving icons are, and put the ones that have stopped to rest. */
  private settle(): void {
    const { settings: s, scale, x, y, moving, still } = this;
    const slow2 = (s.settle.speed * scale) ** 2;
    let kept = 0;
    for (let k = 0; k < this.movingLen; k++) {
      const i = moving[k]!;
      const body = this.bodies[i]!;
      const p = body.translation();
      x[i] = p.x / scale;
      y[i] = p.y / scale;
      const v = body.linvel();
      const slow = v.x * v.x + v.y * v.y < slow2;
      still[i] = slow ? Math.min(255, still[i]! + 1) : 0;
      const n = still[i];
      if (
        n < s.settle.steps ||
        (n < s.settle.maxSteps && this.pressedInto(body) > s.settle.overlap)
      ) {
        moving[kept++] = i;
        continue;
      }
      this.stop(i, body);
    }
    this.movingLen = kept;
  }

  /** How far, in pixels, the deepest of the body's contacts pushes it into a neighbour. */
  private pressedInto(body: RAPIER.RigidBody): number {
    const { narrowPhase, bodies } = this.world;
    const collider = body.collider(0).handle;
    let depth = 0;
    narrowPhase.contactPairsWith(collider, (other) => {
      narrowPhase.contactPair(collider, other, bodies, (manifold) => {
        for (let c = 0; c < manifold.numContacts(); c++) {
          depth = Math.max(depth, -manifold.contactDist(c));
        }
      });
    });
    return depth / this.scale;
  }

  /** Icon `i` comes to rest where its body is: a fixed circle takes the body's place. */
  private stop(i: number, body: RAPIER.RigidBody): void {
    const { rapier: R, settings: s, scale, radius: r } = this;
    // Where it is, but never pressed into the floor or a wall: the heap's weight can push
    // a body a few pixels into them before it settles.
    const px = Math.min(Math.max(this.x[i]!, r), this.width - r);
    const py = Math.min(this.y[i]!, this.height - r);
    this.world.removeRigidBody(body);
    this.world.createCollider(
      R.ColliderDesc.ball(r * scale)
        .setTranslation(px * scale, py * scale)
        .setFriction(s.friction),
    );
    this.x[i] = px;
    this.y[i] = py;
    this.bodies[i] = null;
    this.resting[i] = 1;
    if (py < this.topY) this.topY = py;
    this.settledBuf[this.settledLen++] = i;
  }
}
