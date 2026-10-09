import {
  type Board,
  type Gfx,
  pick,
  type Point,
  type Removal,
  type Remover,
  type ScoopShape,
  type SpriteSource,
} from '../board';
import { riderPortrait } from './portrait';
import {
  blendPose,
  drawRider,
  drawShout,
  headTop,
  type Pose,
  riderSprite,
  STAND_HIP,
} from './rider';
import {
  BARS,
  boxSprite,
  boxTop,
  DELIVERY_SCHEMES,
  type DeliveryScheme,
  drawScooter,
  FOOTBOARD,
  FRONT_WHEEL,
  REAR_WHEEL,
  scooterSprite,
  SEAT,
  toWorld,
  WHEEL_R,
  WHEELBASE,
} from './scooter';
import { type Sway, Tower, TOWER_CAP } from './tower';
import { easeOut, smooth } from '../kit/easing';
import { clumpOf, clumpSomewhere } from '../kit/clump';
import { Frames } from '../kit/clock';
import { Emitter } from '../kit/particles';

// Timing in ms, geometry in world pixels.
/** He rides in over this long, braking hard from this share of it on. */
const ARRIVE_MS = 1400;
const SKID_FROM = 0.6;
/** He starts this far off the left of the canvas. */
const START_X = -110;
/** He hops off over this long, and back on over this long. */
const HOP_OFF_MS = 380;
const HOP_ON_MS = 420;
/** How long the stacking takes: this long, and this much more an icon, up to this long in all. */
const STACK_MIN_MS = 700;
const STACK_PER_ICON_MS = 38;
const STACK_MAX_MS = 3400;
/** The share of that spent stuffing the box, when there are more icons than the tower holds. */
const BOX_SHARE = 0.45;
/** An icon flies from the pile to his hands over this long, and from his hands onto the stack over this long. */
const GRAB_MS = 170;
const TOSS_MS = 400;
/** The tower sways for at least this long once it is built before the top comes off, at a peak of its swing. */
const TEETER_MS = 700;
/** How long a full swing of the tower takes. */
const SWAY_PERIOD_MS = 760;
/** The duds come off the top over this long, and spill out of the box over this long. */
const TOPPLE_MS = 340;
const SPILL_MS = 420;
/** He stares at what is left for this long, then shouts and hops on. */
const STARE_MS = 650;
/** The shout's bubble stays up this long. */
const SHOUT_MS = 1150;
/** He rides off over this long. */
const RIDE_MS = 1750;
/** He parks with the box this far right of the clump's middle, and stands this far left of the scooter's middle. */
const BOX_TO_CLUMP = 37;
const STAND_OFF = 84;
/** The ground under a wheel or his feet may rise this much for each px the scooter moves across, and this much a ms besides. */
const RISE_PER_PX = 1.2;
const RISE_PER_MS = 0.02;
/** How far down through the clump the scooter is reckoned to have sunk when the tower goes up. */
const SINK = 0.7;
/** The tower keeps this far below the view's top. */
const TOP_MARGIN = 34;
/** Where he can aim, as fractions of the canvas's width. */
const AIM_FROM = 0.25;
const AIM_TO = 0.75;

/** Sitting on the scooter, hands on the bars and feet on the footboard. */
const SEATED: Pose = {
  lean: 0.22,
  nearHand: { x: BARS.x - SEAT.x, y: BARS.y - SEAT.y },
  farHand: { x: BARS.x - SEAT.x - 3, y: BARS.y - SEAT.y + 1 },
  nearFoot: { x: FOOTBOARD.x - SEAT.x + 4, y: FOOTBOARD.y - SEAT.y },
  farFoot: { x: FOOTBOARD.x - SEAT.x, y: FOOTBOARD.y - SEAT.y },
};
/** Standing, arms down. */
const STANDING: Pose = {
  lean: 0,
  nearHand: { x: 6, y: 0 },
  farHand: { x: 2, y: 1 },
  nearFoot: { x: 4, y: STAND_HIP },
  farFoot: { x: -4, y: STAND_HIP },
};

interface Options {
  /** The schemes to pick from for each delivery; the first until the first pick. */
  schemes?: readonly DeliveryScheme[];
}

/** What is painted for one scheme. */
interface Look {
  scheme: DeliveryScheme;
  scooter: SpriteSource;
  box: SpriteSource;
  rider: SpriteSource;
  portrait: SpriteSource;
}

/**
 * A food-delivery rider on an electric scooter: zooms in and skids to a stop on the pile, hops
 * off and frantically stacks the icons onto his delivery box (stuffing it first when there are
 * many) into a tall, teetering tower. It sways worse and worse until the duds topple off the
 * top and burst out of the box back onto the pile. He shouts that the order is delivered, hops
 * back on and pulls a wheelie off the canvas, the tower leaning wildly behind him.
 */
export class Delivery implements Remover {
  readonly name = 'delivery';
  /** His scooter, box and body and his cut-in portraits, painted ahead of time. */
  readonly sprites: readonly SpriteSource[];
  private readonly looks: readonly Look[];

  constructor({ schemes = DELIVERY_SCHEMES }: Options = {}) {
    this.looks = schemes.map((scheme) => ({
      scheme,
      scooter: scooterSprite(scheme),
      box: boxSprite(scheme),
      rider: riderSprite(scheme),
      portrait: riderPortrait(scheme),
    }));
    this.sprites = this.looks.flatMap((l) => [l.scooter, l.box, l.rider, l.portrait]);
  }

  /** A clump of the pile somewhere across it. */
  shape(rng: () => number): ScoopShape {
    return clumpSomewhere(rng, AIM_FROM, AIM_TO);
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Run(board, now, rng, pick(this.looks, rng));
  }
}

/** Where the scooter is and how it sits: its origin on the ground between the wheels. */
interface Ride {
  x: number;
  y: number;
  tilt: number;
  /** How fast it goes, 0 to 1. */
  speed: number;
}

/** Where he is: his hip, how his frame is turned, his pose, and how wide his mouth is open. */
interface Him {
  x: number;
  y: number;
  turn: number;
  pose: Pose;
  mouth: number;
}

/** One delivery. */
class Run implements Removal {
  private readonly t0: number;
  /** Where the scooter parks, by its middle, and where he stands to stack. */
  private readonly stopX: number;
  private readonly standX: number;
  /** Where he rides off to, far enough right that the leaning tower is gone too. */
  private readonly endX: number;
  /** How many icons go into the box first, and how many stack in the tower after them. */
  private readonly boxed: number;
  private readonly tower: Tower;
  /** When each phase starts or ends, in ms after `t0`. */
  private readonly stackFrom: number;
  private readonly boxedBy: number;
  private readonly stackedBy: number;
  private readonly topple: number;
  /** Which way the tower is swinging when its top comes off: 1 right, -1 left. */
  private readonly toppleSide: number;
  private readonly depart: number;
  private readonly mounted: number;
  private readonly done: number;
  /** When each icon leaves the pile, and when it is dropped back (Infinity for one that isn't). */
  private readonly launchAt: Float32Array;
  private readonly dropAt: Float32Array;
  /** Where each icon left the pile from. */
  private readonly fromX: Float32Array;
  private readonly fromY: Float32Array;
  /** Which icons have left the pile, and which are gone or dropped. */
  private readonly launched: Uint8Array;
  private readonly finished: Uint8Array;
  /** The pile under each wheel and under his feet, followed smoothly as it settles. */
  private groundRear = NaN;
  private groundFront = NaN;
  private groundStand = NaN;
  /** Where the scooter was across last frame, to know how far the ground may have risen under it. */
  private lastX = NaN;
  private stopped = false;
  private introduced = false;
  private spilled = false;
  private revved = false;
  private readonly dust: Emitter;
  private readonly sweat: Emitter;
  private readonly rng: () => number;
  private readonly frames = new Frames();

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    private readonly look: Look,
  ) {
    const { icons, world, iconRadius, camera, dropCount } = board;
    const n = icons.length;
    this.rng = rng;
    this.t0 = now;
    this.dust = new Emitter(
      {
        capacity: 180,
        colorFrom: '#d8c6a2',
        colorTo: '#a08f74',
        blend: 'normal',
        drag: 2.6,
        gravity: -12,
        sizeOverLife: (u) => 0.55 + 0.9 * u,
        alphaOverLife: (u) => 0.6 * (1 - u) ** 1.5,
      },
      rng,
    );
    this.sweat = new Emitter(
      {
        capacity: 60,
        colorFrom: '#e2f4ff',
        colorTo: '#9fd3f5',
        blend: 'normal',
        gravity: 560,
        sizeOverLife: () => 1,
      },
      rng,
    );

    const { x: clumpX, bottom } = clumpOf(icons, world, 40);
    this.stopX = Math.min(world.width - 52, Math.max(STAND_OFF + 22, clumpX + BOX_TO_CLUMP));
    this.standX = this.stopX - STAND_OFF;

    // The tower stands on the box with its top under the view's top.
    this.boxed = Math.max(0, n - TOWER_CAP);
    const towered = n - this.boxed;
    // By the time the tower goes up, the box has swallowed the top of the clump and the
    // scooter has sunk most of the way down through it.
    const parkedOn = this.groundAt(this.stopX);
    const floor = camera.view.top + camera.view.height - 6;
    const sunk = Math.min(floor, Math.max(parkedOn, parkedOn + SINK * (bottom - parkedOn)));
    const maxHeight = sunk + boxTop(1.15).y - (camera.view.top + TOP_MARGIN);
    this.tower = new Tower(Math.max(1, towered), iconRadius, maxHeight, rng);
    this.endX = world.width + 140 + this.tower.height * 0.6;

    // The stacking: the box first, then the tower layer by layer, ever faster.
    this.stackFrom = ARRIVE_MS + HOP_OFF_MS;
    const span = Math.min(STACK_MAX_MS, STACK_MIN_MS + n * STACK_PER_ICON_MS);
    const boxSpan = this.boxed > 0 ? span * BOX_SHARE : 0;
    this.launchAt = new Float32Array(n);
    this.dropAt = new Float32Array(n).fill(Infinity);
    this.fromX = new Float32Array(n);
    this.fromY = new Float32Array(n);
    this.launched = new Uint8Array(n);
    this.finished = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      this.launchAt[i] =
        i < this.boxed
          ? this.stackFrom + boxSpan * (i / this.boxed)
          : this.stackFrom + boxSpan + (span - boxSpan) * ((i - this.boxed) / towered) ** 0.8;
    }
    const flight = GRAB_MS + TOSS_MS;
    this.boxedBy = this.boxed > 0 ? this.launchAt[this.boxed - 1]! + flight : this.stackFrom;
    this.stackedBy = (n > 0 ? this.launchAt[n - 1]! : this.stackFrom) + flight;

    // The top comes off at a peak of its swing, once it has teetered a while.
    const omega = (Math.PI * 2) / SWAY_PERIOD_MS;
    const swings = Math.ceil(
      ((this.stackedBy + TEETER_MS - this.stackFrom) * omega) / Math.PI - 0.5,
    );
    this.topple = this.stackFrom + (Math.PI / 2 + swings * Math.PI) / omega;
    this.toppleSide = swings % 2 === 0 ? 1 : -1;

    // The duds: the top of the tower, and the rest from among those stuffed in the box.
    const inTower = Math.min(
      towered,
      Math.max(Math.min(dropCount, Math.floor(towered * 0.6), towered - 1), dropCount - this.boxed),
    );
    const inBox = dropCount - inTower;
    for (let j = 0; j < inTower; j++) {
      // Top first, a little after one another.
      this.dropAt[n - 1 - j] = this.topple + (TOPPLE_MS * j) / Math.max(1, inTower);
    }
    for (let j = 0; j < inBox; j++) {
      const i = Math.floor((j * this.boxed) / inBox);
      this.dropAt[i] = this.topple + 120 + (SPILL_MS * j) / inBox;
    }
    this.depart = this.topple + Math.max(TOPPLE_MS, inBox > 0 ? SPILL_MS + 120 : 0) + STARE_MS;
    this.mounted = this.depart + HOP_ON_MS;
    this.done = this.mounted + RIDE_MS;
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  draw(gfx: Gfx, now: number): void {
    const t = now - this.t0;
    const { look } = this;
    const dt = this.frames.dt(now);
    const ride = this.rideAt(t, dt);
    const sway = this.swayAt(t);
    const bulge = this.bulgeAt(t);
    const base = toWorld(boxTop(bulge), ride.x, ride.y, ride.tilt);
    const him = this.himAt(t, ride, dt);
    const toss = { x: this.standX + 12, y: this.groundStand - STAND_HIP - 44 };

    this.events(t, ride, base);
    this.launch(t);

    // Behind it all: the skid mark, and streaks behind him as he zooms.
    this.drawStreaks(gfx, t, ride);

    drawScooter(gfx, ride.x, ride.y, look.scheme, look.scooter, look.box, {
      tilt: ride.tilt,
      spin: (ride.x - START_X) / WHEEL_R,
      speed: ride.speed,
      bulge,
      lid: this.lidAt(t),
    });
    this.drawTower(gfx, t, ride, sway, base);
    this.drawHim(gfx, him);
    this.drawFlying(gfx, t, ride, sway, base, toss);

    this.dust.step(dt);
    this.dust.draw(gfx);
    this.sweat.step(dt);
    this.sweat.draw(gfx);

    // The shout, as he hops back on.
    if (t >= this.depart && t < this.depart + SHOUT_MS) {
      const u = (t - this.depart) / SHOUT_MS;
      const pop = u < 0.15 ? easeOut(u / 0.15) * 1.15 : 1.15 - 0.15 * smooth((u - 0.15) / 0.1);
      const head = headTop(him.pose.lean);
      drawShout(gfx, him.x + head.x + 4, him.y + head.y - 2, pop, 1 - smooth((u - 0.85) / 0.15));
    }
  }

  /** What happens once at its moment: the skid's stop, the top coming off, the shout, the getaway. */
  private events(t: number, ride: Ride, base: Point): void {
    const { board, rng } = this;
    if (!this.stopped && t >= ARRIVE_MS) {
      this.stopped = true;
      board.fx.shake(3, 220);
      for (const wheel of [REAR_WHEEL, FRONT_WHEEL]) {
        const at = toWorld({ x: wheel.x, y: 0 }, ride.x, ride.y, ride.tilt);
        this.dust.burst(12, () => ({
          x: at.x + (rng() - 0.5) * 10,
          y: at.y - 3,
          vx: (rng() - 0.3) * 190,
          vy: -(20 + 70 * rng()),
          life: 600 + 400 * rng(),
          size: 12 + 14 * rng(),
        }));
      }
    }
    if (!this.spilled && t >= this.topple) {
      this.spilled = true;
      board.fx.shake(4, 300);
      board.fx.hitStop(60);
      this.sweatBurst(8);
      if (this.boxed > 0) {
        this.dust.burst(10, () => ({
          x: base.x + (rng() - 0.5) * 30,
          y: base.y,
          vx: (rng() - 0.5) * 160,
          vy: -(40 + 80 * rng()),
          life: 500 + 300 * rng(),
          size: 10 + 10 * rng(),
        }));
      }
    }
    // As he shouts and hops back on, the cut-in.
    if (!this.introduced && t >= this.depart) {
      this.introduced = true;
      board.fx.cutIn({
        name: 'delivery',
        color: this.look.scheme.main,
        portrait: this.look.portrait,
      });
    }
    if (!this.revved && t >= this.mounted) {
      this.revved = true;
      const at = toWorld({ x: REAR_WHEEL.x, y: 0 }, ride.x, ride.y, ride.tilt);
      this.dust.burst(14, () => ({
        x: at.x,
        y: at.y - 3,
        vx: -(80 + 160 * rng()),
        vy: -(20 + 60 * rng()),
        life: 500 + 400 * rng(),
        size: 10 + 12 * rng(),
      }));
    }
  }

  /** Take each icon out of the pile as its turn comes to be tossed. */
  private launch(t: number): void {
    const { board } = this;
    const n = board.icons.length;
    for (let i = 0; i < n; i++) {
      if (this.launched[i] || t < this.launchAt[i]!) continue;
      this.launched[i] = 1;
      const at = board.take(i) ?? board.icons[i]!;
      this.fromX[i] = at.x;
      this.fromY[i] = at.y;
    }
  }

  /** The tower: each slot that has landed and not toppled, bottom up, and the top coming off. */
  private drawTower(gfx: Gfx, t: number, ride: Ride, sway: Sway, base: Point): void {
    const { board, tower } = this;
    const n = board.icons.length;
    const c = Math.cos(ride.tilt);
    const s = Math.sin(ride.tilt);
    const landing = GRAB_MS + TOSS_MS;
    for (let i = this.boxed; i < n; i++) {
      if (this.finished[i] || t < this.launchAt[i]! + landing) continue;
      const p = tower.place(i - this.boxed, sway);
      const x = base.x + p.x * c - p.y * s;
      const y = base.y + p.x * s + p.y * c;
      if (t >= this.dropAt[i]!) {
        // Off the top, flung the way it was swinging.
        this.finished[i] = 1;
        const side = this.toppleSide;
        board.drop(
          i,
          x,
          y,
          side * (140 + 160 * this.rng()) + (this.rng() - 0.5) * 60,
          -(60 + 140 * this.rng()),
        );
        continue;
      }
      gfx.icon(x, y, 1, { rotation: ride.tilt + p.rotation, scaleX: p.scaleX, scaleY: p.scaleY });
    }
  }

  /**
   * The icons in the air: from the pile up to his hands, then tossed onto the top of the stack
   * (or into the box, while it is being stuffed). Those that land in the box are gone, but for
   * the duds, which wait in it to burst back out.
   */
  private drawFlying(gfx: Gfx, t: number, ride: Ride, sway: Sway, base: Point, toss: Point): void {
    const { board, tower } = this;
    const n = board.icons.length;
    const c = Math.cos(ride.tilt);
    const s = Math.sin(ride.tilt);
    const mouth = { x: base.x, y: base.y + 4 };
    for (let i = 0; i < n; i++) {
      if (!this.launched[i] || this.finished[i]) continue;
      const age = t - this.launchAt[i]!;
      const boxed = i < this.boxed;
      if (boxed && t >= this.dropAt[i]!) {
        // Bursting back out of the box, onto the pile.
        this.finished[i] = 1;
        board.drop(
          i,
          base.x + (this.rng() - 0.5) * 24,
          base.y - 4,
          (this.rng() - 0.5) * 380,
          -(240 + 280 * this.rng()),
        );
        continue;
      }
      if (age >= GRAB_MS + TOSS_MS) {
        if (boxed && this.dropAt[i] === Infinity) {
          this.finished[i] = 1;
          board.destroy(i);
        }
        // A dud in the box waits there, unseen; one on the tower is drawn with it.
        continue;
      }
      if (age < GRAB_MS) {
        // Snatched up off the pile into his hands.
        const u = easeOut(age / GRAB_MS);
        const x = this.fromX[i]! + (toss.x - this.fromX[i]!) * u;
        const y = this.fromY[i]! + (toss.y - this.fromY[i]!) * u - 18 * Math.sin(Math.PI * u);
        gfx.icon(x, y, 1, { rotation: u * 2 });
        continue;
      }
      // Tossed up onto the stack, spinning, as the stack moves.
      const u = (age - GRAB_MS) / TOSS_MS;
      let tx = mouth.x;
      let ty = mouth.y;
      let scale = 1 - 0.35 * u;
      if (!boxed) {
        const p = tower.place(i - this.boxed, sway);
        tx = base.x + p.x * c - p.y * s;
        ty = base.y + p.x * s + p.y * c;
        scale = 1 + (tower.scale - 1) * u;
      }
      const e = smooth(u);
      const lift = 40 + 0.3 * Math.max(0, toss.y - ty);
      const x = toss.x + (tx - toss.x) * e;
      const y = toss.y + (ty - toss.y) * e - lift * 4 * u * (1 - u);
      gfx.icon(x, y, scale, { rotation: (1 - u) * 5 * (i % 2 ? 1 : -1) });
    }
  }

  /** Him, on the scooter or off it. */
  private drawHim(gfx: Gfx, him: Him): void {
    drawRider(gfx, this.look.rider, this.look.scheme, him.x, him.y, him.turn, {
      pose: him.pose,
      mouth: him.mouth,
    });
  }

  /** The skid mark he leaves braking, and streaks behind him as he zooms in and off. */
  private drawStreaks(gfx: Gfx, t: number, ride: Ride): void {
    if (t >= ARRIVE_MS * SKID_FROM && t < ARRIVE_MS + 1500) {
      const fade = t < ARRIVE_MS ? 1 : 1 - (t - ARRIVE_MS) / 1500;
      const skidFrom = this.rideX(ARRIVE_MS * SKID_FROM) + REAR_WHEEL.x;
      const rear = toWorld({ x: REAR_WHEEL.x, y: 0 }, ride.x, ride.y, ride.tilt);
      gfx.line(skidFrom, rear.y - 1, rear.x, rear.y - 1, 2.6, '#2a2520', {
        alpha: 0.45 * fade,
      });
    }
    if (ride.speed > 0.25) {
      const a = (ride.speed - 0.25) / 0.75;
      for (const [dy, len] of [
        [-16, 46],
        [-34, 64],
        [-58, 38],
      ] as const) {
        const at = toWorld({ x: -60, y: dy }, ride.x, ride.y, ride.tilt);
        gfx.line(at.x - len * a, at.y, at.x - 6, at.y, 2, '#f4f1ea', { alpha: 0.55 * a });
      }
    }
  }

  /** How far the tower leans at `t`: a little as it goes up, worse and worse until the top comes off, then wildly as he rides. */
  private swayAt(t: number): Sway {
    if (t < this.stackFrom) return { lean: 0, whip: 0 };
    const omega = (Math.PI * 2) / SWAY_PERIOD_MS;
    const phase = (t - this.stackFrom) * omega;
    let amp: number;
    if (t < this.stackedBy)
      amp = 0.06 + 0.1 * smooth((t - this.stackFrom) / (this.stackedBy - this.stackFrom));
    else if (t < this.topple)
      amp = 0.16 + 0.32 * smooth((t - this.stackedBy) / (this.topple - this.stackedBy));
    else amp = 0.48 - 0.3 * smooth((t - this.topple) / 500);
    // Each icon landing knocks it.
    const jiggle = t < this.stackedBy ? 0.03 * Math.sin(t * 0.05) : 0;
    let lean = amp * Math.sin(phase) + jiggle;
    let whip = 0.5 * amp * Math.sin(phase * 2.3 + 1);
    if (t >= this.depart) {
      // The hop back on jolts it, and riding off it leans back wildly, then flails.
      const hop = Math.sin(Math.PI * Math.min(1, (t - this.depart) / HOP_ON_MS));
      lean += 0.12 * hop;
      if (t >= this.mounted) {
        const u = (t - this.mounted) / RIDE_MS;
        lean += -0.55 * smooth(u / 0.25) * (1 - 0.5 * u) + 0.22 * Math.sin(t * 0.011);
        whip += 0.35 * Math.sin(t * 0.019) * smooth(u / 0.2);
      }
    }
    return { lean, whip };
  }

  /** How swollen the box is at `t`: fatter the more is stuffed in it, a gulp at each, and less once the duds burst out. */
  private bulgeAt(t: number): number {
    if (this.boxed === 0 || t < this.stackFrom) return 1;
    const full = smooth((t - this.stackFrom) / Math.max(1, this.boxedBy - this.stackFrom));
    const gulp = t < this.boxedBy ? 0.035 * Math.abs(Math.sin(t * 0.045)) : 0;
    const burst = t >= this.topple ? 0.06 * smooth((t - this.topple) / SPILL_MS) : 0;
    return 1 + 0.15 * full + gulp - burst;
  }

  /** How far the box's lid is open at `t`: flapping as it is stuffed, flung open as the duds burst out. */
  private lidAt(t: number): number {
    if (this.boxed === 0) return 0;
    const open = (from: number, to: number, ease: number) =>
      smooth((t - from) / ease) * (1 - smooth((t - to) / ease));
    const flap = open(this.stackFrom, this.boxedBy, 120) * (0.7 + 0.4 * Math.sin(t * 0.05));
    const burst = open(this.topple + 60, this.topple + 120 + SPILL_MS, 90) * 2.1;
    return flap + burst;
  }

  /** The scooter at `t`: zooming in and skidding to a stop, parked, then pulling a wheelie off to the right. */
  private rideAt(t: number, dt: number): Ride {
    const x = this.rideX(t);
    const rear = x + REAR_WHEEL.x;
    const front = x + FRONT_WHEEL.x;
    // Follow the pile's top under each wheel, smoothly, as it settles.
    const rise = Math.abs(x - this.lastX) * RISE_PER_PX + dt * RISE_PER_MS;
    this.lastX = x;
    this.groundRear = follow(this.groundRear, this.groundAt(rear), dt, rise);
    this.groundFront = follow(this.groundFront, this.groundAt(front), dt, rise);
    const level = Math.max(
      -0.35,
      Math.min(0.35, Math.atan2(this.groundFront - this.groundRear, WHEELBASE)),
    );
    let y = (this.groundRear + this.groundFront) / 2;
    let tilt = level;
    let speed = 0;
    if (t < ARRIVE_MS) {
      const u = t / ARRIVE_MS;
      speed = 1 - u;
      // Braking so hard the back wheel lifts: a stoppie, about the front wheel.
      const stoppie =
        0.17 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - SKID_FROM) / (1 - SKID_FROM))));
      tilt += stoppie;
      y -= Math.sin(stoppie) * FRONT_WHEEL.x;
    } else if (t < this.mounted) {
      // Rocking back down onto the back wheel as it stops.
      const since = t - ARRIVE_MS;
      tilt += -0.05 * Math.exp(-since / 160) * Math.sin(since / 45);
    } else {
      const u = (t - this.mounted) / RIDE_MS;
      speed = Math.min(1, u * 2);
      // A wheelie, about the back wheel, wobbling.
      const wheelie =
        -0.3 * Math.sin(Math.PI * Math.min(1, u / 0.45)) +
        0.05 * Math.sin(t * 0.03) * smooth(u / 0.2);
      tilt += wheelie;
      y += Math.sin(wheelie) * -REAR_WHEEL.x;
    }
    return { x, y, tilt, speed };
  }

  /** Where the scooter's middle is across at `t`. */
  private rideX(t: number): number {
    if (t < ARRIVE_MS) {
      const u = t / ARRIVE_MS;
      return this.stopX - (this.stopX - START_X) * (1 - u) ** 2;
    }
    if (t < this.mounted) return this.stopX;
    const u = Math.min(1, (t - this.mounted) / RIDE_MS);
    return this.stopX + (this.endX - this.stopX) * u * u;
  }

  /** Him at `t`: riding in, hopping off, stacking in a frenzy, staring up at the tower, hopping back on and riding off. */
  private himAt(t: number, ride: Ride, dt: number): Him {
    const seat = toWorld(SEAT, ride.x, ride.y, ride.tilt);
    this.groundStand = follow(this.groundStand, this.groundAt(this.standX), dt, dt * RISE_PER_MS);
    const stand = { x: this.standX, y: this.groundStand - STAND_HIP };
    if (t < ARRIVE_MS) {
      const u = t / ARRIVE_MS;
      const brace = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - SKID_FROM) / (1 - SKID_FROM))));
      const pose = { ...SEATED, lean: SEATED.lean + 0.25 * (1 - u) - 0.3 * brace };
      return { x: seat.x, y: seat.y, turn: ride.tilt, pose, mouth: 0.6 * brace };
    }
    if (t < this.stackFrom) {
      // Hopping off, over the box, to stand behind the scooter.
      const u = smooth((t - ARRIVE_MS) / HOP_OFF_MS);
      return {
        x: seat.x + (stand.x - seat.x) * u,
        y: seat.y + (stand.y - seat.y) * u - 30 * Math.sin(Math.PI * u),
        turn: ride.tilt * (1 - u),
        pose: blendPose(SEATED, STANDING, u),
        mouth: 0,
      };
    }
    if (t < this.depart) return this.atWork(t, stand, dt);
    if (t < this.mounted) {
      // Back on, in one leap.
      const u = smooth((t - this.depart) / HOP_ON_MS);
      return {
        x: stand.x + (seat.x - stand.x) * u,
        y: stand.y + (seat.y - stand.y) * u - 34 * Math.sin(Math.PI * u),
        turn: ride.tilt * u,
        pose: blendPose(blendPose(STANDING, cheer(t), 1 - u), SEATED, u),
        mouth: 1,
      };
    }
    const u = (t - this.mounted) / RIDE_MS;
    const pose = { ...SEATED, lean: SEATED.lean + 0.15 * smooth(u / 0.3) };
    return { x: seat.x, y: seat.y, turn: ride.tilt, pose, mouth: u < 0.4 ? 0.8 : 0 };
  }

  /** Him off the scooter: tossing icons up as fast as his arms go, then staring up as the tower teeters, flinching as its top comes off. */
  private atWork(t: number, stand: Point, dt: number): Him {
    const head = headTop(0);
    if (t < this.stackedBy - TOSS_MS) {
      // Arms pumping one after the other, feet stamping, mouth going.
      const beat = t * 0.036;
      const near = 0.5 + 0.5 * Math.sin(beat);
      const far = 1 - near;
      const up = { x: 11, y: -40 };
      const down = { x: 9, y: -8 };
      const mix = (u: number) => ({
        x: down.x + (up.x - down.x) * u,
        y: down.y + (up.y - down.y) * u,
      });
      const pose: Pose = {
        lean: -0.08 + 0.05 * Math.sin(beat),
        nearHand: mix(near),
        farHand: mix(far),
        nearFoot: { x: 5, y: STAND_HIP - 5 * Math.max(0, Math.sin(beat * 0.5)) },
        farFoot: { x: -5, y: STAND_HIP - 5 * Math.max(0, -Math.sin(beat * 0.5)) },
      };
      this.sweat.stream(10, dt, () => this.sweatDrop(stand.x + head.x, stand.y + head.y));
      const bob = -2 * Math.abs(Math.sin(beat));
      return {
        x: stand.x,
        y: stand.y + bob,
        turn: 0,
        pose,
        mouth: 0.35 + 0.3 * Math.sin(t * 0.05),
      };
    }
    if (t < this.topple) {
      // Backing off a step, hands up to steady it from afar, staring up.
      const u = smooth((t - (this.stackedBy - TOSS_MS)) / 300);
      const steady = Math.sin(t * 0.012) * 3;
      const pose: Pose = {
        lean: -0.22 * u,
        nearHand: { x: 14 + steady, y: -38 },
        farHand: { x: 10 + steady, y: -36 },
        nearFoot: { x: 4, y: STAND_HIP },
        farFoot: { x: -6, y: STAND_HIP },
      };
      this.sweat.stream(6, dt, () => this.sweatDrop(stand.x + head.x, stand.y + head.y));
      return {
        x: stand.x - 6 * u,
        y: stand.y,
        turn: 0,
        pose: blendPose(STANDING, pose, u),
        mouth: 0.2,
      };
    }
    // The top comes off: he jumps, hands to his helmet.
    const since = t - this.topple;
    const jump = 10 * Math.sin(Math.PI * Math.min(1, since / 320));
    const pose: Pose = {
      lean: -0.3,
      nearHand: { x: 10, y: -42 },
      farHand: { x: -2, y: -44 },
      nearFoot: { x: 6, y: STAND_HIP - 2 },
      farFoot: { x: -6, y: STAND_HIP - 2 },
    };
    return { x: stand.x - 6, y: stand.y - jump, turn: 0, pose, mouth: 0.9 };
  }

  /** A drop of sweat flying off his helmet. */
  private sweatDrop(
    x: number,
    y: number,
  ): { x: number; y: number; vx: number; vy: number; life: number; size: number } {
    const { rng } = this;
    const side = rng() < 0.5 ? -1 : 1;
    return {
      x: x + side * 4,
      y,
      vx: side * (40 + 60 * rng()),
      vy: -(90 + 80 * rng()),
      life: 450 + 200 * rng(),
      size: 3 + 2 * rng(),
    };
  }

  /** A burst of sweat off his helmet. */
  private sweatBurst(n: number): void {
    const head = headTop(0);
    const x = this.standX - 6 + head.x;
    const y = this.groundStand - STAND_HIP + head.y;
    this.sweat.burst(n, () => this.sweatDrop(x, y));
  }

  /** The top of the pile's surface at x, kept in the canvas and the view. */
  private groundAt(x: number): number {
    const { board } = this;
    const { width } = board.world;
    const r = board.iconRadius;
    const view = board.camera.view;
    let sum = 0;
    let count = 0;
    for (const dx of [-14, 0, 14]) {
      const top = board.topAt(Math.min(width - r, Math.max(r, x + dx)));
      if (top !== null) {
        sum += top;
        count++;
      }
    }
    const floor = view.top + view.height - 6;
    if (count === 0) return floor;
    return Math.min(floor, sum / count - r * 0.8);
  }
}

/**
 * `from` moved on towards `to` over `dt` ms, to follow the pile smoothly; straight there the
 * first time. It rises at most `rise`, so an icon falling past (a dud, say) isn't taken for
 * the ground.
 */
function follow(from: number, to: number, dt: number, rise: number): number {
  if (Number.isNaN(from)) return to;
  return from + (Math.max(to, from - rise) - from) * (1 - Math.exp(-dt / 90));
}

/** Arms flung up as he shouts. */
function cheer(t: number): Pose {
  const wave = Math.sin(t * 0.03) * 4;
  return {
    lean: -0.1,
    nearHand: { x: 14 + wave, y: -44 },
    farHand: { x: -4, y: -40 },
    nearFoot: { x: 4, y: STAND_HIP },
    farFoot: { x: -4, y: STAND_HIP },
  };
}
