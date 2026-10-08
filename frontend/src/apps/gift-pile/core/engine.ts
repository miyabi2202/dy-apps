import type RAPIER from '@dimforge/rapier2d-compat';
import { canvasSize, PILE, type PileSettings } from './config';
import type { ScoopShape } from './protocol';

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
/** A support that has moved this far (in collision radii) from where its dependents rested on it has left them. */
const SUPPORT_MOVE = 0.35;
/** A support that comes to rest this far (in pixels) from where its dependents rested on it hands them on to be re-checked. */
const SUPPORT_DRIFT = 0.5;
/** Contacts up to this far apart, in pixels, count as touching: soft contacts hold bodies a little apart at rest. */
const TOUCH_GAP = 1;
/** How many steps apart the support sweep runs while the pile is changing. */
const SWEEP_EVERY = 6;
/**
 * `remove()` takes icons from the top down, each one's height blurred by up to this many
 * collision radii, so the top layer goes first but not in a neat line.
 */
const REMOVE_BLUR = 8;
/** A clump scooped `near` somewhere is centred on the highest icon within this many radii of it. */
const NEAR_REACH = 3;

/**
 * The pile, simulated by Rapier. Every icon is a circle in a world with a floor and two
 * walls. New icons are released on a line above the pile and fall as rigid bodies that
 * don't bounce but do rub against each other, so they slide down the heap until it holds
 * them. Once one has been near enough to still for a while, touching something that can
 * hold it, it comes to rest: its body is taken out of the engine and a fixed circle is left
 * in its place for the others to land on. So the engine only ever simulates what is moving,
 * however big the pile.
 *
 * A fixed circle can't notice when what held it up goes, so the engine keeps the support
 * graph itself. Only the floor and resting icons hold an icon up (never a wall, which is
 * frictionless, nor anything still moving), so the pile settles from the ground up. When an
 * icon rests it records what it was touching, and each of those remembers it as a
 * dependent. A support that is taken away, or moves away from where its dependents rested
 * on it, wakes them. And whenever the pile has changed, a sweep walks the graph from the
 * floor and wakes every resting icon it can't reach: icons holding each other up with no
 * path to the ground go together, as they should. That is the whole rule, so there is no
 * geometry to get wrong.
 *
 * The user can pick an icon up (`grab`): it leaves the engine until it is let go
 * (`release`), when it falls from there, or destroyed.
 *
 * Positions are kept in pixels in typed arrays indexed by icon, sized for `maxItems` up
 * front; the engine itself works in metres (see `pxPerMetre`).
 */
export class PileEngine {
  /** The canvas's size in pixels (the play area plus the margin); `resize()` changes it. */
  width: number;
  height: number;
  /** The collision radius; the icon is drawn bigger than this. */
  readonly radius: number;
  /** How far inside the canvas the walls and floor are. */
  readonly margin: number;
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
  /** 1 while an icon is set aside for the page to take (see `scoop`). */
  readonly reserved: Uint8Array;

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
  /** The floor's collider handle. */
  private floor = -1;
  private readonly bodies: (RAPIER.RigidBody | null)[];
  /** The fixed circle left where a resting icon is, and which icon each such collider is. */
  private readonly fixed: (RAPIER.Collider | null)[];
  private readonly iconOfCollider = new Map<number, number>();
  // Moving icons, in release order.
  private readonly moving: Int32Array;
  private movingLen = 0;
  /** Steps a moving icon has been slower than `settle.speed`, capped at 65535. */
  private readonly still: Uint16Array;
  /** The step each icon was released on. */
  private readonly born: Int32Array;
  private stepCount = 0;
  private spawnCredit = 0;

  // The support graph. `dependents[j]` lists the icons resting on j, and `floorDeps` the
  // ones on the floor, as (icon, rest) pairs: `rest` is the icon's rest count at the time,
  // so an entry from an earlier rest on something else is seen to be stale. `anchor` is
  // where a woken support was when it was woken, which is where its dependents rested on it.
  private dependents: (number[] | null)[];
  private floorDeps: number[] = [];
  private readonly restCount: Uint32Array;
  private readonly anchorX: Float32Array;
  private readonly anchorY: Float32Array;
  // Whether the graph has changed since the last sweep, and steps since then.
  private dirty = false;
  private sinceSweep = 0;
  private readonly reached: Uint8Array;

  // Icons that came to rest, and that left rest, since the last drain, for the renderer.
  private readonly settledBuf: Int32Array;
  private settledLen = 0;
  private wokenBuf: number[] = [];

  constructor({ rapier, settings = PILE, rng = Math.random }: Options) {
    this.rapier = rapier;
    this.settings = settings;
    this.rng = rng;
    const canvas = canvasSize(settings.world, settings.margin);
    this.width = canvas.width;
    this.height = canvas.height;
    this.radius = settings.collisionRadius;
    this.margin = settings.margin;
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
    this.reserved = new Uint8Array(n);
    this.bodies = new Array<RAPIER.RigidBody | null>(n).fill(null);
    this.fixed = new Array<RAPIER.Collider | null>(n).fill(null);
    this.moving = new Int32Array(n);
    this.still = new Uint16Array(n);
    this.born = new Int32Array(n);
    this.dependents = new Array<number[] | null>(n).fill(null);
    this.restCount = new Uint32Array(n);
    this.anchorX = new Float32Array(n);
    this.anchorY = new Float32Array(n);
    this.reached = new Uint8Array(n);
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

  /** A new, empty world with a play area of this size (in pixels). */
  resize(width: number, height: number): void {
    const canvas = canvasSize({ width, height }, this.margin);
    this.width = canvas.width;
    this.height = canvas.height;
    this.clear();
  }

  /** Back to an empty world. */
  clear(): void {
    this.world.free();
    this.world = this.createWorld();
    this.bodies.fill(null);
    this.fixed.fill(null);
    this.iconOfCollider.clear();
    this.dependents = new Array<number[] | null>(this.maxItems).fill(null);
    this.floorDeps = [];
    this.dirty = false;
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
    this.reserved.fill(0);
    this.generation++;
  }

  /** Frees the engine's memory; the instance is unusable afterwards. */
  free(): void {
    this.world.free();
  }

  /**
   * The user picks icon `i` up: out of the pile or out of the air, and out of the engine
   * until `release` or `destroy`. Whatever rested on it is woken.
   */
  grab(i: number): void {
    if (i < 0 || i >= this.count || this.dead[i] || this.held[i]) return;
    if (this.resting[i]) {
      this.unfix(i);
    } else {
      const body = this.bodies[i];
      if (body) this.world.removeRigidBody(body);
      this.bodies[i] = null;
      this.dropFromMoving(i);
    }
    this.wakeDependents(i);
    this.held[i] = 1;
  }

  /**
   * Held icon `i` is let go at (x, y) in pixels: it falls from there, moving at (vx, vy)
   * pixels per second.
   */
  release(i: number, x: number, y: number, vx = 0, vy = 0): void {
    if (!this.held[i]) return;
    this.held[i] = 0;
    this.reserved[i] = 0;
    const r = this.radius;
    const m = this.margin;
    this.launch(
      i,
      Math.min(Math.max(x, m + r), this.width - m - r),
      Math.min(y, this.height - m - r),
      vy,
      vx,
    );
  }

  /** The user drops held icon `i` in the bin. */
  destroy(i: number): void {
    if (!this.held[i]) return;
    this.held[i] = 0;
    this.dead[i] = 1;
    this.destroyed++;
  }

  /**
   * Set aside `n` icons from the pile and the air (not one being held or already set
   * aside), roughly from the top down, for the page to `grab` one by one as it carries them
   * off; or as `shape` says: a rounded clump of the pile at a point across it, the nearest to
   * the top of the pile there, or the pile's outer layer, all across, before the next one
   * down. Until then each
   * stays in the pile as it is, and no later scoop takes it; a `release` puts it back up for
   * scooping. Returns them, roughly highest first.
   */
  scoop(n: number, shape: ScoopShape = { kind: 'top' }): number[] {
    // Rank every icon that can go by its height, blurred by a few radii of noise so the
    // top layer thins out unevenly instead of being peeled off in a line, and take the
    // highest `n`. Ranking all of them means the count asked for always goes while there
    // are that many.
    const candidates: number[] = [];
    const rank = new Float32Array(this.count);
    const blur = REMOVE_BLUR * this.radius;
    for (let i = 0; i < this.count; i++) {
      if (this.dead[i] || this.held[i] || this.reserved[i]) continue;
      candidates.push(i);
    }
    if (shape.kind === 'layers') {
      // By how far each is below the top of the pile where it is, with no blur, so the outer
      // layer goes evenly all across before any of the next.
      const depth = this.depthBelowTop(candidates);
      for (const i of candidates) rank[i] = depth.get(i)!;
    } else {
      const centre =
        shape.kind === 'clump' ? this.surfaceNear(candidates, shape.at * this.width) : null;
      for (const i of candidates) {
        // By distance from the clump's centre, or else by height.
        const by = centre ? Math.hypot(this.x[i]! - centre.x, this.y[i]! - centre.y) : this.y[i]!;
        rank[i] = by + this.rng() * blur;
      }
    }
    candidates.sort((a, b) => rank[a]! - rank[b]!);
    candidates.length = Math.min(Math.floor(n), candidates.length);
    for (const i of candidates) this.reserved[i] = 1;
    return candidates;
  }

  /**
   * How far each of `candidates` is below the top of the pile where it is: below the highest
   * of them in its column, two radii wide, or the one either side, so a dip between two
   * icons doesn't count as the top.
   */
  private depthBelowTop(candidates: number[]): Map<number, number> {
    const width = 2 * this.radius;
    const top = new Float32Array(Math.ceil(this.width / width) + 2).fill(Infinity);
    const column = (i: number) =>
      Math.min(top.length - 2, Math.max(1, Math.floor(this.x[i]! / width) + 1));
    for (const i of candidates) top[column(i)] = Math.min(top[column(i)]!, this.y[i]!);
    const depth = new Map<number, number>();
    for (const i of candidates) {
      const c = column(i);
      depth.set(i, this.y[i]! - Math.min(top[c - 1]!, top[c]!, top[c + 1]!));
    }
    return depth;
  }

  /** The top of the pile at `x`: the highest of `candidates` within `NEAR_REACH` radii of it, or the nearest. */
  private surfaceNear(candidates: number[], x: number): { x: number; y: number } | null {
    let best: number | null = null;
    let nearest: number | null = null;
    for (const i of candidates) {
      const dx = Math.abs(this.x[i]! - x);
      if (nearest === null || dx < Math.abs(this.x[nearest]! - x)) nearest = i;
      if (dx <= NEAR_REACH * this.radius && (best === null || this.y[i]! < this.y[best]!)) best = i;
    }
    const at = best ?? nearest;
    return at === null ? null : { x, y: this.y[at]! };
  }

  /** Destroy `n` icons at once, as `scoop` picks them. Returns how many went. */
  remove(n: number): number {
    const ids = this.scoop(n);
    for (const i of ids) {
      this.grab(i);
      this.destroy(i);
    }
    return ids.length;
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
    this.stepWorld();
    this.settle();
    // Sweep every few steps while the pile changes, and at once when it has come to rest.
    if (this.dirty && (this.movingLen === 0 || ++this.sinceSweep >= SWEEP_EVERY)) this.sweep();
  }

  /**
   * One physics step. `World.step()` would do the same and then rescan every body and
   * collider to wrap any the simulation itself created or removed (soft-body debris), which
   * this engine never has; that scan is O(all colliders) and costs 13 ms a step at 100,000
   * resting icons, so the pipeline is stepped directly.
   */
  private stepWorld(): void {
    const w = this.world;
    w.physicsPipeline.step(
      w.gravity,
      w.integrationParameters,
      w.islands,
      w.broadPhase,
      w.narrowPhase,
      w.bodies,
      w.colliders,
      w.softBodies,
      w.impulseJoints,
      w.multibodyJoints,
      w.ccdSolver,
    );
  }

  /** A world with the floor and walls in it, in metres. */
  private createWorld(): RAPIER.World {
    const { rapier: R, settings, scale } = this;
    const world = new R.World({ x: 0, y: settings.gravity * scale });
    world.timestep = this.dt;
    world.integrationParameters.contact_natural_frequency = settings.contactHz;
    world.numSolverIterations = settings.solverSubsteps;
    const m = this.margin * scale;
    const w = this.width * scale;
    const h = this.height * scale;
    // Thick slabs, so nothing gets through them; the walls run far up for a tall pile.
    const thick = 50 * scale;
    const tall = 100_000 * scale;
    // The walls are frictionless: with friction, an icon pressed against one by a neighbour
    // above it hangs there, and a column of them can grow up the wall.
    const wall = (x: number) =>
      world.createCollider(R.ColliderDesc.cuboid(thick, tall).setTranslation(x, 0).setFriction(0));
    this.floor = world.createCollider(
      R.ColliderDesc.cuboid(w / 2 + thick, thick)
        .setTranslation(w / 2, h - m + thick)
        .setFriction(settings.friction),
    ).handle;
    wall(m - thick);
    wall(w - m + thick);
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
        px = this.margin + r + this.rng() * (this.width - 2 * this.margin - d);
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

  /** Icon `i` starts moving at (px, py) in pixels, falling at `vy` px/s and going sideways at `vx`. */
  private launch(i: number, px: number, py: number, vy: number, vx = 0): void {
    const { settings: s, rapier: R, scale } = this;
    this.x[i] = px;
    this.y[i] = py;
    this.anchorX[i] = px;
    this.anchorY[i] = py;
    this.still[i] = 0;
    this.born[i] = this.stepCount;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(px * scale, py * scale)
        .setLinvel(vx * scale, vy * scale)
        .setCcdEnabled(true)
        // Resting is ours to decide: Rapier's sleep would leave an icon hanging off a
        // single neighbour that it should slide down from.
        .setCanSleep(false),
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

  /**
   * Read back where the moving icons are, wake the dependents of any that has moved away
   * from where they rested on it, and put the ones that have stopped to rest.
   */
  private settle(): void {
    const { settings: s, scale, x, y, moving, still, anchorX, anchorY } = this;
    const slow2 = (s.settle.speed * scale) ** 2;
    const moved2 = (SUPPORT_MOVE * this.radius) ** 2;
    let kept = 0;
    for (let k = 0; k < this.movingLen; k++) {
      const i = moving[k]!;
      const body = this.bodies[i]!;
      const p = body.translation();
      x[i] = p.x / scale;
      y[i] = p.y / scale;
      const deps = this.dependents[i];
      if (deps && deps.length > 0) {
        const dx = x[i] - anchorX[i]!;
        const dy = y[i] - anchorY[i]!;
        if (dx * dx + dy * dy > moved2) this.wakeDependents(i);
      }
      const v = body.linvel();
      const slow = v.x * v.x + v.y * v.y < slow2;
      still[i] = slow ? Math.min(65535, still[i]! + 1) : 0;
      const n = still[i];
      if (n < s.settle.steps) {
        moving[kept++] = i;
        continue;
      }
      const { depth, onFloor, supports } = this.contacts(body);
      // Still for long enough, with something to hold it, and not pressed into a
      // neighbour, unless that has gone on for a long time.
      const held = onFloor || supports.length > 0;
      if (held && (depth <= s.settle.overlap || n >= s.settle.maxSteps)) {
        this.stop(i, body, onFloor, supports);
      } else {
        moving[kept++] = i;
      }
    }
    this.movingLen = kept;
  }

  /**
   * The body's touching contacts: how far, in pixels, the deepest pushes it into a
   * neighbour; whether it is on the floor; and the resting icons it touches. Walls and
   * moving icons hold nothing.
   */
  private contacts(body: RAPIER.RigidBody): {
    depth: number;
    onFloor: boolean;
    supports: number[];
  } {
    const { narrowPhase, bodies } = this.world;
    const touchGap = TOUCH_GAP * this.scale;
    const collider = body.collider(0).handle;
    let depth = 0;
    let onFloor = false;
    const supports: number[] = [];
    narrowPhase.contactPairsWith(collider, (other) => {
      let touching = false;
      narrowPhase.contactPair(collider, other, bodies, (manifold) => {
        for (let c = 0; c < manifold.numContacts(); c++) {
          const dist = manifold.contactDist(c);
          if (dist <= touchGap) touching = true;
          depth = Math.max(depth, -dist);
        }
      });
      if (!touching) return;
      if (other === this.floor) {
        onFloor = true;
        return;
      }
      const resting = this.iconOfCollider.get(other);
      if (resting !== undefined) supports.push(resting);
    });
    return { depth: depth / this.scale, onFloor, supports };
  }

  /**
   * Icon `i` comes to rest where its body is, held by `supports`: a fixed circle takes the
   * body's place, and each support remembers it.
   */
  private stop(i: number, body: RAPIER.RigidBody, onFloor: boolean, supports: number[]): void {
    const { rapier: R, settings: s, scale, radius: r } = this;
    // Where it is, but never pressed into the floor or a wall: the heap's weight can push
    // a body a few pixels into them before it settles.
    const m = this.margin;
    const px = Math.min(Math.max(this.x[i]!, m + r), this.width - m - r);
    const py = Math.min(this.y[i]!, this.height - m - r);
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
    this.resting[i] = 1;
    if (py < this.topY) this.topY = py;
    this.settledBuf[this.settledLen++] = i;
    const rest = ++this.restCount[i]!;
    if (onFloor) this.floorDeps.push(i, rest);
    for (const j of supports) {
      const deps = this.dependents[j];
      if (deps) deps.push(i, rest);
      else this.dependents[j] = [i, rest];
    }
    // Woken and come to rest a little away from where its dependents rested on it: they
    // re-check their footing now, so drift can't add up across wakes.
    if (this.dependents[i]) {
      const dx = px - this.anchorX[i]!;
      const dy = py - this.anchorY[i]!;
      if (dx * dx + dy * dy > SUPPORT_DRIFT * SUPPORT_DRIFT) this.wakeDependents(i);
    }
    // Resting can't leave anything unreached, so no sweep is needed for it: only leaving
    // rest (`unfix`) marks the graph dirty, and a pure stream never sweeps.
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
    this.dirty = true;
  }

  /** Whatever rests on icon `j` falls again: `j` has gone, or moved away from under it. */
  private wakeDependents(j: number): void {
    const deps = this.dependents[j];
    if (!deps) return;
    this.dependents[j] = null;
    for (let k = 0; k < deps.length; k += 2) {
      const i = deps[k]!;
      if (this.resting[i] && this.restCount[i] === deps[k + 1]) this.wake(i);
    }
    if (this.bodies[j]) {
      this.anchorX[j] = this.x[j]!;
      this.anchorY[j] = this.y[j]!;
    }
  }

  /** Resting icon `i` falls again from where it is. */
  private wake(i: number): void {
    this.unfix(i);
    this.launch(i, this.x[i]!, this.y[i]!, 0);
  }

  /**
   * Wake every resting icon with no path to the ground: walk the graph from the floor along
   * current support edges, dropping stale ones on the way, and wake whatever wasn't reached.
   */
  private sweep(): void {
    this.dirty = false;
    this.sinceSweep = 0;
    const { reached, restCount, resting, dependents } = this;
    reached.fill(0, 0, this.count);
    const queue: number[] = [];
    /** Valid entries of a pair list reach their icon; the list is compacted to them. */
    const follow = (pairs: number[]): number[] => {
      let w = 0;
      for (let k = 0; k < pairs.length; k += 2) {
        const i = pairs[k]!;
        if (!resting[i] || restCount[i] !== pairs[k + 1]) continue;
        pairs[w++] = i;
        pairs[w++] = pairs[k + 1]!;
        if (!reached[i]) {
          reached[i] = 1;
          queue.push(i);
        }
      }
      pairs.length = w;
      return pairs;
    };
    this.floorDeps = follow(this.floorDeps);
    while (queue.length) {
      const j = queue.pop()!;
      const deps = dependents[j];
      if (deps) dependents[j] = follow(deps).length ? deps : null;
    }
    for (let i = 0; i < this.count; i++) {
      if (resting[i] && !reached[i]) this.wake(i);
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
