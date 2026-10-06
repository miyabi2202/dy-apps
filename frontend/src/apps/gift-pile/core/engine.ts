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
/** A woken icon that has moved this far (in collision radii) wakes whatever rested on it. */
const CASCADE_MOVE = 0.5;

/**
 * The pile, simulated by Rapier. Every icon is a circle in a world with a floor and two
 * walls. New icons are released on a line above the pile and fall as rigid bodies that
 * don't bounce but do rub against each other, so they slide down the heap until it holds
 * them. Once one has been near enough to still for a while it comes to rest: its body is
 * taken out of the engine and a fixed circle is left in its place for the others to land on.
 * So the engine only ever simulates what is moving, however big the pile.
 *
 * The user can pick an icon up (`grab`): it leaves the engine until it is let go
 * (`release`), when it falls from there, or destroyed. Taking a resting icon out of the pile
 * wakes the ones that rested on it, and each of those that moves wakes the ones on it in
 * turn, so the pile settles into the gap.
 *
 * Positions are kept in pixels in typed arrays indexed by icon, sized for `maxItems` up
 * front; the engine itself works in metres (see `pxPerMetre`).
 */
export class PileEngine {
  /** The world's size in pixels; `resize()` changes it. */
  width: number;
  height: number;
  /** The collision radius; the icon is drawn bigger than this. */
  readonly radius: number;
  readonly maxItems: number;

  /** Every icon's position, in pixels: live for moving ones, final for resting ones. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** 1 once an icon has come to rest. */
  readonly resting: Uint8Array;
  /** 1 while the user holds an icon. */
  readonly held: Uint8Array;
  /** 1 once an icon has been destroyed. */
  readonly dead: Uint8Array;

  /** Icons released into the world so far (indices `0 … count - 1`), destroyed ones included. */
  count = 0;
  /** Icons destroyed so far. */
  destroyed = 0;
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
  /** The fixed circle left where a resting icon is, and which icon each such collider is. */
  private readonly fixed: (RAPIER.Collider | null)[];
  private readonly iconOfCollider = new Map<number, number>();
  // Moving icons, in release order.
  private readonly moving: Int32Array;
  private movingLen = 0;
  /** Steps a moving icon has been slower than `settle.speed`, capped at 255. */
  private readonly still: Uint8Array;
  /** The step each icon was released on. */
  private readonly born: Int32Array;
  private stepCount = 0;
  private spawnCredit = 0;
  /** For a woken icon, where it was woken (pixels); NaN once it has passed its wake on. */
  private readonly wokeX: Float32Array;
  private readonly wokeY: Float32Array;

  // Icons that came to rest, and that left rest, since the last drain, for the renderer.
  private readonly settledBuf: Int32Array;
  private settledLen = 0;
  private wokenBuf: number[] = [];

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
    this.held = new Uint8Array(n);
    this.dead = new Uint8Array(n);
    this.bodies = new Array<RAPIER.RigidBody | null>(n).fill(null);
    this.fixed = new Array<RAPIER.Collider | null>(n).fill(null);
    this.moving = new Int32Array(n);
    this.still = new Uint8Array(n);
    this.born = new Int32Array(n);
    this.wokeX = new Float32Array(n).fill(NaN);
    this.wokeY = new Float32Array(n).fill(NaN);
    this.settledBuf = new Int32Array(n);
    this.world = this.createWorld();
  }

  /** Icons still moving. */
  get movingCount(): number {
    return this.movingLen;
  }

  /** Icons in the world: moving, resting or held. */
  get alive(): number {
    return this.count - this.destroyed;
  }

  /** Queue `n` more icons; they're released over the next steps. Returns how many fit. */
  add(n: number): number {
    const room = this.maxItems - this.count - this.queued;
    const added = Math.max(0, Math.min(Math.floor(n), room));
    this.queued += added;
    return added;
  }

  /** A new, empty world of this size (in pixels). */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.clear();
  }

  /** Back to an empty world. */
  clear(): void {
    this.world.free();
    this.world = this.createWorld();
    this.bodies.fill(null);
    this.fixed.fill(null);
    this.iconOfCollider.clear();
    this.count = 0;
    this.destroyed = 0;
    this.queued = 0;
    this.movingLen = 0;
    this.settledLen = 0;
    this.wokenBuf = [];
    this.spawnCredit = 0;
    this.stepCount = 0;
    this.topY = this.height;
    this.resting.fill(0);
    this.held.fill(0);
    this.dead.fill(0);
    this.generation++;
  }

  /** Frees the engine's memory; the instance is unusable afterwards. */
  free(): void {
    this.world.free();
  }

  /**
   * The user picks icon `i` up: out of the pile (waking what rested on it) or out of the
   * air, and out of the engine until `release` or `destroy`.
   */
  grab(i: number): void {
    if (i < 0 || i >= this.count || this.dead[i] || this.held[i]) return;
    if (this.resting[i]) {
      this.unfix(i);
      this.wakeAbove(this.x[i]!, this.y[i]!);
    } else {
      const body = this.bodies[i];
      if (body) this.world.removeRigidBody(body);
      this.bodies[i] = null;
      this.dropFromMoving(i);
    }
    this.held[i] = 1;
  }

  /** The user lets held icon `i` go at (x, y) in pixels: it falls from there. */
  release(i: number, x: number, y: number): void {
    if (!this.held[i]) return;
    this.held[i] = 0;
    const r = this.radius;
    this.launch(i, Math.min(Math.max(x, r), this.width - r), Math.min(y, this.height - r), 0);
  }

  /** The user drops held icon `i` in the bin. */
  destroy(i: number): void {
    if (!this.held[i]) return;
    this.held[i] = 0;
    this.dead[i] = 1;
    this.destroyed++;
  }

  /**
   * Destroy `n` icons picked at random from the pile and the air (not one being held), each
   * waking what rested on it. Returns how many went.
   */
  remove(n: number): number {
    // Draw without replacement from the icons that can go, so the count asked for always
    // goes while there are that many: drawing blind would keep missing once most are dead.
    const candidates: number[] = [];
    for (let i = 0; i < this.count; i++) {
      if (!this.dead[i] && !this.held[i]) candidates.push(i);
    }
    const want = Math.min(Math.floor(n), candidates.length);
    for (let k = 0; k < want; k++) {
      const pick = k + Math.floor(this.rng() * (candidates.length - k));
      const i = candidates[pick]!;
      candidates[pick] = candidates[k]!;
      this.grab(i);
      this.destroy(i);
    }
    return want;
  }

  /** Hands over every icon that came to rest since the last call. */
  drainSettled(fn: (index: number) => void): void {
    for (let k = 0; k < this.settledLen; k++) fn(this.settledBuf[k]!);
    this.settledLen = 0;
  }

  /** Hands over every icon that left the resting pile since the last call. */
  drainWoken(fn: (index: number) => void): void {
    for (const i of this.wokenBuf) fn(i);
    this.wokenBuf = [];
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
    const { settings: s, x, y, moving } = this;
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
      this.resting[i] = 0;
      this.launch(i, px, py, s.spawnSpeed);
      nearX.push(px);
      nearY.push(py);
      released++;
    }
    this.spawnCredit -= released;
    this.queued -= released;
  }

  /** Icon `i` starts moving at (px, py) in pixels, falling at `vy` px/s. */
  private launch(i: number, px: number, py: number, vy: number): void {
    const { settings: s, rapier: R, scale } = this;
    this.x[i] = px;
    this.y[i] = py;
    this.still[i] = 0;
    this.born[i] = this.stepCount;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(px * scale, py * scale)
        .setLinvel(0, vy * scale)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      R.ColliderDesc.ball(this.radius * scale)
        .setRestitution(0)
        .setFriction(s.friction),
      body,
    );
    this.bodies[i] = body;
    this.moving[this.movingLen++] = i;
  }

  /** Read back where the moving icons are, put the ones that have stopped to rest, and pass wakes on. */
  private settle(): void {
    const { settings: s, scale, x, y, moving, still, wokeX, wokeY } = this;
    const slow2 = (s.settle.speed * scale) ** 2;
    const cascade2 = (CASCADE_MOVE * this.radius) ** 2;
    let kept = 0;
    for (let k = 0; k < this.movingLen; k++) {
      const i = moving[k]!;
      const body = this.bodies[i]!;
      const p = body.translation();
      x[i] = p.x / scale;
      y[i] = p.y / scale;
      // Woken and now out of the way: whatever rested on it can fall too.
      const wx = wokeX[i]!;
      if (!Number.isNaN(wx)) {
        const wy = wokeY[i]!;
        if ((x[i] - wx) ** 2 + (y[i] - wy) ** 2 > cascade2) {
          wokeX[i] = NaN;
          this.wakeAbove(wx, wy);
        }
      }
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
    const collider = this.world.createCollider(
      R.ColliderDesc.ball(r * scale)
        .setTranslation(px * scale, py * scale)
        .setFriction(s.friction),
    );
    this.fixed[i] = collider;
    this.iconOfCollider.set(collider.handle, i);
    this.x[i] = px;
    this.y[i] = py;
    this.bodies[i] = null;
    this.wokeX[i] = NaN;
    this.resting[i] = 1;
    if (py < this.topY) this.topY = py;
    this.settledBuf[this.settledLen++] = i;
  }

  /** Resting icon `i` leaves the pile: its fixed circle goes, and the renderer is told. */
  private unfix(i: number): void {
    const collider = this.fixed[i];
    if (collider) {
      this.iconOfCollider.delete(collider.handle);
      this.world.removeCollider(collider, true);
    }
    this.fixed[i] = null;
    this.resting[i] = 0;
    this.wokenBuf.push(i);
  }

  /** Every resting icon touching the spot (px, py) from above starts falling again. */
  private wakeAbove(px: number, py: number): void {
    const { rapier: R, scale, radius: r } = this;
    const reach = new R.Ball((2 * r + 1) * scale);
    const woken: number[] = [];
    this.world.intersectionsWithShape({ x: px * scale, y: py * scale }, 0, reach, (collider) => {
      const j = this.iconOfCollider.get(collider.handle);
      if (j !== undefined && this.y[j]! < py - 0.5) woken.push(j);
      return true;
    });
    for (const j of woken) {
      this.unfix(j);
      this.wokeX[j] = this.x[j]!;
      this.wokeY[j] = this.y[j]!;
      this.launch(j, this.x[j]!, this.y[j]!, 0);
    }
  }

  private dropFromMoving(i: number): void {
    for (let k = 0; k < this.movingLen; k++) {
      if (this.moving[k] === i) {
        this.moving[k] = this.moving[--this.movingLen]!;
        return;
      }
    }
  }
}
