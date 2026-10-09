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
import { heap, MOUND_ICON_R, MOUND_KEEP, MOUND_SLOTS } from './mound';
import { riderPortrait } from './portrait';
import {
  blendPose,
  drawRider,
  drawShout,
  headTop,
  type Pose,
  reachTo,
  riderSprite,
  riseToReach,
  STAND_HIP,
} from './rider';
import {
  BARS,
  boxScale,
  boxSprite,
  DELIVERY_SCHEMES,
  type DeliveryScheme,
  drawScooter,
  drawSlack,
  FOOTBOARD,
  FRONT_WHEEL,
  knotPoint,
  lidLift,
  lidPoint,
  REAR_WHEEL,
  rimOf,
  type RopeLook,
  ropePoint,
  scooterSprite,
  SEAT,
  toWorld,
  WHEEL_R,
  WHEELBASE,
} from './scooter';
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
/** How long the packing takes: this long, and this much more an icon, up to this long in all. */
const PACK_MIN_MS = 700;
const PACK_PER_ICON_MS = 38;
const PACK_MAX_MS = 3000;
/** The share of that spent stuffing the box, when there is more than the mound on top holds. */
const BOX_SHARE = 0.5;
/** An icon flies from the pile to his hands over this long, and from his hands into the box over this long. */
const GRAB_MS = 170;
const TOSS_MS = 380;
/** Each go at forcing the lid shut takes this long. */
const TRY_MS = 620;
/** He glares at the heap for this long before giving up forcing it. */
const SIGH_MS = 420;
/** Throwing out the excess takes this long, and this much more a dud, up to this long in all. */
const OUT_MIN_MS = 300;
const OUT_PER_DUD_MS = 75;
const OUT_MAX_MS = 2000;
/** A dud goes from the heap to over his shoulder over this long; the one under it pops up into its place over this long. */
const PLUCK_MS = 200;
const POP_MS = 140;
/** He slaps the lid shut over this long, then ties it down over this long. */
const SHUT_MS = 360;
const ROPE_MS = 1500;
/** When, as shares of the tying, the second wrap starts, he starts on the knot, and he gives it a tug. */
const WRAP_2 = 0.34;
const KNOT_AT = 0.68;
const TUG_AT = 0.86;
/** He admires his knot for this long before he shouts and hops on. */
const ADMIRE_MS = 220;
/** The shout's bubble stays up this long. */
const SHOUT_MS = 1150;
/** He rides off over this long. */
const RIDE_MS = 1750;
/** He parks with the box this far right of the clump's middle. */
const BOX_TO_CLUMP = 37;
/** He stands this far left of the scooter's middle to pack, and steps up to this far behind the box to force the lid and tie it. */
const STAND_OFF = 92;
const BESIDE = 9;
/** The most he goes up on tiptoe, or jumps, to reach the lid. */
const MAX_RISE = 16;
/** The ground under a wheel or his feet may rise this much for each px the scooter moves across, and this much a ms besides. */
const RISE_PER_PX = 1.2;
const RISE_PER_MS = 0.02;
/** Where he can aim, as fractions of the canvas's width. */
const AIM_FROM = 0.25;
const AIM_TO = 0.75;
/**
 * The lid, in radians open: thrown wide as he packs, forced down this far at each go and
 * springing back up this far, then left ajar on the mound and pulled down a little more by
 * the rope, which bows it up this many px.
 */
const LID_OPEN = 1.75;
const LID_PRESS = 0.08;
const LID_SPRUNG = 0.85;
const LID_AJAR = 0.12;
const LID_TIED = 0.05;
const BOW_TIED = 2.2;

/** What becomes of an icon: stuffed into the box, kept on the mound in its top, or thrown out. */
const BOXED = 0;
const KEPT = 1;
const DUD = 2;

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
 * off and frantically packs the icons into his delivery box until a little heap sticks out of
 * its top. He tries to force the lid shut on it, and it springs back up; so he throws the duds
 * off the top over his shoulder back onto the pile, shuts the lid on what is left and ties it
 * down with a rope. He shouts that the order is delivered, hops back on and pulls a wheelie off
 * the canvas.
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

/** How the box is this frame: how swollen, how far its lid is open, and how far the lid bows. */
interface Box {
  bulge: number;
  lid: number;
  bow: number;
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
  /** Where the scooter parks, by its middle, and where he stands to pack. */
  private readonly stopX: number;
  private readonly standX: number;
  /** Where he rides off to, off the right of the canvas. */
  private readonly endX: number;
  /** How many icons are thrown out, how many of the kept ones sit on the mound, and how many duds are on it to start with. */
  private readonly drops: number;
  private readonly keptMound: number;
  private readonly shown: number;
  /** How many icons go into the box first (the rest of the kept ones, and the duds the mound has no room for). */
  private readonly boxed: number;
  /** How big the mound's icons are drawn, as a share of an icon's size. */
  private readonly moundScale: number;
  /** What becomes of each icon, and its slot on the mound (kept) or its turn to be thrown out (a dud). */
  private readonly role: Uint8Array;
  private readonly rank: Int32Array;
  /** The duds, in the order they are thrown out, and when each goes. */
  private readonly dudIcon: Int32Array;
  private readonly tossAt: Float32Array;
  /** How many goes he has at forcing the lid shut: two, or one when nothing is over. */
  private readonly tries: number;
  /** When each phase starts or ends, in ms after `t0`. */
  private readonly packFrom: number;
  private readonly boxedBy: number;
  private readonly packedBy: number;
  private readonly tryFrom: number;
  private readonly triedBy: number;
  private readonly outFrom: number;
  private readonly shutAt: number;
  private readonly ropeFrom: number;
  private readonly depart: number;
  private readonly mounted: number;
  private readonly done: number;
  /** How far the lid sits open on the mound once shut, and once tied. */
  private readonly ajar: number;
  private readonly tied: number;
  /** When each icon leaves the pile. */
  private readonly launchAt: Float32Array;
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
  /** Where his hip was this frame, for his sweat. */
  private hipX = 0;
  private hipY = 0;
  private stopped = false;
  private slammed = 0;
  private sighed = false;
  private thudded = false;
  private tugged = false;
  private introduced = false;
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
    const { icons, world, iconRadius, dropCount } = board;
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

    const { x: clumpX } = clumpOf(icons, world, 40);
    this.stopX = Math.min(world.width - 52, Math.max(STAND_OFF + 22, clumpX + BOX_TO_CLUMP));
    this.standX = this.stopX - STAND_OFF;
    this.endX = world.width + 140;
    this.hipX = this.standX;

    // Who goes where: the kept ones fill the bottom of the mound and the rest go into the box;
    // the duds are heaped over the mound, and those it has no room for wait in the box, to be
    // pulled up out of it as the ones over them are thrown out.
    this.drops = Math.min(dropCount, n);
    const kept = n - this.drops;
    this.keptMound = Math.min(kept, MOUND_KEEP);
    this.shown = Math.min(this.drops, MOUND_SLOTS - this.keptMound);
    const hidden = this.drops - this.shown;
    this.boxed = kept - this.keptMound + hidden;
    this.moundScale = MOUND_ICON_R / iconRadius;
    this.role = new Uint8Array(n);
    this.rank = new Int32Array(n);
    this.dudIcon = new Int32Array(this.drops);
    for (let j = 0; j < hidden; j++) {
      const i = Math.floor((j * this.boxed) / hidden);
      this.role[i] = DUD;
      this.rank[i] = this.shown + j;
      this.dudIcon[this.shown + j] = i;
    }
    for (let k = 0; k < this.keptMound; k++) {
      this.role[this.boxed + k] = KEPT;
      this.rank[this.boxed + k] = k;
    }
    for (let j = 0; j < this.shown; j++) {
      const i = this.boxed + this.keptMound + j;
      this.role[i] = DUD;
      this.rank[i] = j;
      this.dudIcon[j] = i;
    }

    // The packing: the box first, then the mound, ever faster.
    this.packFrom = ARRIVE_MS + HOP_OFF_MS;
    const span = Math.min(PACK_MAX_MS, PACK_MIN_MS + n * PACK_PER_ICON_MS);
    const boxSpan = this.boxed > 0 ? span * BOX_SHARE : 0;
    const heaped = Math.max(1, n - this.boxed);
    this.launchAt = new Float32Array(n);
    this.fromX = new Float32Array(n);
    this.fromY = new Float32Array(n);
    this.launched = new Uint8Array(n);
    this.finished = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      this.launchAt[i] =
        i < this.boxed
          ? this.packFrom + boxSpan * (i / this.boxed)
          : this.packFrom + boxSpan + (span - boxSpan) * ((i - this.boxed) / heaped) ** 0.8;
    }
    const flight = GRAB_MS + TOSS_MS;
    this.boxedBy = this.boxed > 0 ? this.launchAt[this.boxed - 1]! + flight : this.packFrom;
    this.packedBy = (n > 0 ? this.launchAt[n - 1]! : this.packFrom) + flight;

    // Then the goes at the lid, throwing out the excess, shutting it and tying it down.
    this.tries = this.drops > 0 ? 2 : 1;
    this.tryFrom = this.packedBy + 150;
    this.triedBy = this.tryFrom + this.tries * TRY_MS;
    this.outFrom = this.triedBy + SIGH_MS;
    const outSpan = Math.min(OUT_MAX_MS, OUT_MIN_MS + this.drops * OUT_PER_DUD_MS);
    this.tossAt = new Float32Array(this.drops);
    for (let j = 0; j < this.drops; j++) {
      this.tossAt[j] = this.outFrom + outSpan * (j / this.drops);
    }
    this.shutAt = this.drops > 0 ? this.outFrom + outSpan + PLUCK_MS : this.triedBy;
    this.ropeFrom = this.drops > 0 ? this.shutAt + SHUT_MS : this.triedBy + 120;
    this.depart = this.ropeFrom + ROPE_MS + ADMIRE_MS;
    this.mounted = this.depart + HOP_ON_MS;
    this.done = this.mounted + RIDE_MS;
    this.ajar = this.keptMound > 0 ? LID_AJAR : 0;
    this.tied = this.keptMound > 0 ? LID_TIED : 0;
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  draw(gfx: Gfx, now: number): void {
    const t = now - this.t0;
    const { look } = this;
    const dt = this.frames.dt(now);
    const ride = this.rideAt(t, dt);
    const box: Box = { bulge: this.bulgeAt(t), lid: this.lidAt(t), bow: this.bowAt(t) };
    const him = this.himAt(t, ride, box, dt);
    this.hipX = him.x;
    this.hipY = him.y;
    const toss = { x: this.standX + 12, y: this.groundStand - STAND_HIP - 44 };

    this.events(t, ride, box);
    this.launch(t);

    // Behind it all: the skid mark, and streaks behind him as he zooms.
    this.drawStreaks(gfx, t, ride);

    drawScooter(gfx, ride.x, ride.y, look.scheme, look.scooter, look.box, {
      tilt: ride.tilt,
      spin: (ride.x - START_X) / WHEEL_R,
      speed: ride.speed,
      ...box,
      rope: this.ropeAt(t),
      contents: () => this.drawMound(gfx, t, box),
    });
    this.drawHim(gfx, him);
    this.drawFlying(gfx, t, ride, box, toss, him);
    this.drawHeldRope(gfx, t, ride, box, him);

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

  /** What happens once at its moment: the skid's stop, each slam of the lid, giving up, the thud, the tug, the shout, the getaway. */
  private events(t: number, ride: Ride, box: Box): void {
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
    // The lid slammed down on the heap.
    while (this.slammed < this.tries && t >= this.tryFrom + (this.slammed + 0.48) * TRY_MS) {
      this.slammed++;
      board.fx.shake(2.5, 160);
      this.sweatBurst(4);
    }
    if (!this.sighed && this.drops > 0 && t >= this.triedBy) {
      this.sighed = true;
      this.sweatBurst(8);
    }
    // The lid slapped shut on what is left, with a puff out of the box.
    if (!this.thudded && this.drops > 0 && t >= this.shutAt + SHUT_MS * 0.3) {
      this.thudded = true;
      board.fx.shake(3, 200);
      const rim = toWorld(rimOf(box.bulge), ride.x, ride.y, ride.tilt);
      this.dust.burst(8, () => ({
        x: rim.x + (rng() - 0.3) * 40,
        y: rim.y,
        vx: (rng() - 0.3) * 120,
        vy: -(20 + 50 * rng()),
        life: 400 + 300 * rng(),
        size: 8 + 8 * rng(),
      }));
    }
    if (!this.tugged && t >= this.ropeFrom + TUG_AT * ROPE_MS) {
      this.tugged = true;
      board.fx.shake(2, 160);
      board.fx.hitStop(50);
      this.sweatBurst(3);
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

  /** Take each icon out of the pile as its turn comes to be packed. */
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

  /** Where slot `k` of the mound is in the scooter's frame, `rise` px down, squashed under the lid as it is. */
  private slotAt(k: number, box: Box, rise = 0): ReturnType<typeof heap> {
    const rim = rimOf(box.bulge);
    const h = heap(k, boxScale(box.bulge).sx, rise, (dx) =>
      lidLift(dx, box.bulge, box.lid, box.bow),
    );
    return { ...h, x: rim.x + h.x, y: rim.y + h.y };
  }

  /** Where slot `k` of the mound is in the world. */
  private slotInWorld(k: number, ride: Ride, box: Box): Point {
    return toWorld(this.slotAt(k, box), ride.x, ride.y, ride.tilt);
  }

  /** The mound in the top of the box, in the scooter's frame: the kept ones under the duds, and each dud waiting its turn. */
  private drawMound(gfx: Gfx, t: number, box: Box): void {
    const landing = GRAB_MS + TOSS_MS;
    const put = (k: number, rise: number) => {
      const h = this.slotAt(k, box, rise);
      gfx.icon(h.x, h.y, this.moundScale, {
        rotation: h.rotation,
        scaleX: h.scaleX,
        scaleY: h.scaleY,
      });
    };
    for (let k = 0; k < this.keptMound; k++) {
      if (t >= this.launchAt[this.boxed + k]! + landing) put(k, 0);
    }
    for (let j = 0; j < this.drops; j++) {
      if (t >= this.tossAt[j]!) continue;
      if (j < this.shown) {
        if (t >= this.launchAt[this.dudIcon[j]!]! + landing) put(this.keptMound + j, 0);
        continue;
      }
      // One from the box pops up into the place of the one thrown out over it.
      const freed = this.tossAt[j - this.shown]!;
      if (t < freed) break;
      put(this.keptMound + (j % this.shown), 12 * (1 - easeOut((t - freed) / POP_MS)));
    }
  }

  /**
   * The icons in the air: from the pile up to his hands, then tossed into the box or onto the
   * mound; and the duds, from the mound over his shoulder, where he lets them go back onto the
   * pile. Those that land in the box are gone, but for the duds, which wait in it.
   */
  private drawFlying(gfx: Gfx, t: number, ride: Ride, box: Box, toss: Point, him: Him): void {
    const { board, rng } = this;
    const n = board.icons.length;
    const rim = rimOf(box.bulge);
    const mouth = toWorld({ x: rim.x, y: rim.y + 4 }, ride.x, ride.y, ride.tilt);
    const shoulder = { x: him.x - 6, y: him.y - 48 };
    const landing = GRAB_MS + TOSS_MS;
    const s = this.moundScale;
    for (let i = 0; i < n; i++) {
      if (!this.launched[i] || this.finished[i]) continue;
      const role = this.role[i]!;
      const rank = this.rank[i]!;
      if (role === DUD && t >= this.tossAt[rank]!) {
        const age = t - this.tossAt[rank]!;
        if (age >= PLUCK_MS) {
          // Let go over his shoulder, flung back onto the pile behind him.
          this.finished[i] = 1;
          board.drop(i, shoulder.x, shoulder.y, -(130 + 170 * rng()), -(170 + 190 * rng()));
          continue;
        }
        // Plucked off the heap and swung up over his head.
        const from = this.slotInWorld(this.keptMound + (rank % this.shown), ride, box);
        const u = age / PLUCK_MS;
        const e = smooth(u);
        const x = from.x + (shoulder.x - from.x) * e;
        const y = from.y + (shoulder.y - from.y) * e - 16 * Math.sin(Math.PI * u);
        gfx.icon(x, y, s + (1 - s) * u, { rotation: -4 * u });
        continue;
      }
      const age = t - this.launchAt[i]!;
      if (age >= landing) {
        if (role === BOXED) {
          this.finished[i] = 1;
          board.destroy(i);
        }
        // One on the mound is drawn with it; a dud in the box waits there, unseen.
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
      // Tossed up into the box, or onto the mound, spinning.
      const u = (age - GRAB_MS) / TOSS_MS;
      let target = mouth;
      let scale = 1 - 0.35 * u;
      const slot =
        role === KEPT ? rank : role === DUD && rank < this.shown ? this.keptMound + rank : -1;
      if (slot >= 0) {
        target = this.slotInWorld(slot, ride, box);
        scale = 1 + (s - 1) * u;
      }
      const e = smooth(u);
      const lift = 40 + 0.3 * Math.max(0, toss.y - target.y);
      const x = toss.x + (target.x - toss.x) * e;
      const y = toss.y + (target.y - toss.y) * e - lift * 4 * u * (1 - u);
      gfx.icon(x, y, scale, { rotation: (1 - u) * 5 * (i % 2 ? 1 : -1) });
    }
  }

  /** The rope in his hands as he ties it: the end he is hauling round the box, then the two ends of the knot as he tugs it tight. */
  private drawHeldRope(gfx: Gfx, t: number, ride: Ride, box: Box, him: Him): void {
    if (t < this.ropeFrom || t >= this.depart - ADMIRE_MS) return;
    const r = (t - this.ropeFrom) / ROPE_MS;
    const hand = { x: him.x + him.pose.farHand.x, y: him.y + him.pose.farHand.y };
    const world = (p: Point) => toWorld(p, ride.x, ride.y, ride.tilt);
    if (r < KNOT_AT) {
      const rope = this.ropeAt(t)!;
      const k = r < WRAP_2 ? 0 : 1;
      const end = world(ropePoint(k, rope.wraps[k], box.bulge, box.lid, box.bow));
      drawSlack(gfx, end, hand, 7 + 3 * Math.sin(t * 0.02));
      return;
    }
    if (r >= TUG_AT) {
      const knot = world(knotPoint(box.bulge, box.lid, box.bow));
      const near = { x: him.x + him.pose.nearHand.x, y: him.y + him.pose.nearHand.y };
      drawSlack(gfx, knot, near, 0.5);
      drawSlack(gfx, knot, hand, 0.5);
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

  /** Which go at the lid `t` is in, and how far through it; null outside them. */
  private tryAt(t: number): { k: number; u: number } | null {
    if (t < this.tryFrom || t >= this.triedBy) return null;
    const k = Math.floor((t - this.tryFrom) / TRY_MS);
    return { k, u: (t - this.tryFrom - k * TRY_MS) / TRY_MS };
  }

  /** Whether go `k` at the lid is the one that shuts it (the only one, when nothing is over). */
  private shutsOn(k: number): boolean {
    return this.drops === 0 && k === this.tries - 1;
  }

  /** How far through the tying `t` is, 0 to 1. */
  private ropeShare(t: number): number {
    return Math.min(1, Math.max(0, (t - this.ropeFrom) / ROPE_MS));
  }

  /** How hard he is tugging the knot at `t`, 0 to 1 and back. */
  private tugAt(t: number): number {
    return Math.sin(
      Math.PI * Math.min(1, Math.max(0, (this.ropeShare(t) - TUG_AT) / (1 - TUG_AT))),
    );
  }

  /** The rope at `t`: each wrap pulled down round the box in turn, then the knot; none before he starts. */
  private ropeAt(t: number): RopeLook | undefined {
    if (t < this.ropeFrom) return undefined;
    const r = this.ropeShare(t);
    return {
      wraps: [smooth(r / (WRAP_2 - 0.04)), smooth((r - WRAP_2) / (KNOT_AT - WRAP_2 - 0.04))],
      knot: smooth((r - KNOT_AT) / 0.12),
    };
  }

  /**
   * How far the lid is open at `t`: flapping as the box is stuffed and thrown wide for the
   * mound; slammed down on the heap and springing back at each go; up while the excess is
   * thrown out; slapped shut, ajar on what is left; and pulled down by the rope.
   */
  private lidAt(t: number): number {
    if (t < this.packFrom) return 0;
    if (t < this.tryFrom) {
      const open = smooth((t - this.packFrom) / 160);
      const flap = 0.75 + 0.35 * Math.sin(t * 0.05);
      const wide =
        this.boxed > 0
          ? flap + (LID_OPEN - flap) * smooth((t - this.boxedBy + 200) / 260)
          : LID_OPEN;
      return open * wide;
    }
    const go = this.tryAt(t);
    if (go) {
      const { k, u } = go;
      // Hauled down a little as he jumps for it, then slammed down on the heap.
      const from = (k === 0 ? LID_OPEN : LID_SPRUNG) - 0.2 * smooth(u / 0.3);
      if (u < 0.3) return from;
      if (u < 0.48) return from + (LID_PRESS - from) * ((u - 0.3) / 0.18) ** 2;
      if (this.shutsOn(k)) return LID_PRESS + (this.ajar - LID_PRESS) * smooth((u - 0.48) / 0.3);
      // Held down as the heap shoves back, then springing up out of his hands.
      if (u < 0.68) return LID_PRESS + 0.07 * Math.abs(Math.sin(((u - 0.48) / 0.2) * 3 * Math.PI));
      return LID_PRESS + (LID_SPRUNG - LID_PRESS) * springy((u - 0.68) / 0.32);
    }
    if (this.drops > 0 && t < this.shutAt) {
      return LID_SPRUNG + 0.05 * Math.sin(t * 0.03) * smooth((t - this.triedBy) / 200);
    }
    if (this.drops > 0 && t < this.shutAt + SHUT_MS) {
      const v = (t - this.shutAt) / SHUT_MS;
      return Math.max(0, this.ajar + (LID_SPRUNG - this.ajar) * (1 - springy(v)));
    }
    const r = this.ropeShare(t);
    return Math.max(
      0,
      this.ajar + (this.tied - this.ajar) * smooth(r / KNOT_AT) - 0.03 * this.tugAt(t),
    );
  }

  /** How far the lid bows up at `t`: as the rope pulls it down on what is in the box, most as he tugs the knot. */
  private bowAt(t: number): number {
    if (t < this.ropeFrom) return 0;
    return BOW_TIED * smooth((this.ropeShare(t) - 0.1) / 0.6) + 0.8 * this.tugAt(t);
  }

  /** How swollen the box is at `t`: fatter the more is stuffed in it, a gulp at each, squeezed out at each go at the lid and at the tug. */
  private bulgeAt(t: number): number {
    if (t < this.packFrom) return 1;
    let bulge = 1;
    if (this.boxed > 0) {
      const fat = 0.15 * Math.min(1, 0.35 + this.boxed / 40);
      bulge += fat * smooth((t - this.packFrom) / Math.max(1, this.boxedBy - this.packFrom));
      if (t < this.boxedBy) bulge += 0.035 * Math.abs(Math.sin(t * 0.045));
      // A little less, once the duds waiting in it are pulled out.
      const hidden = this.drops - this.shown;
      if (hidden > 0) {
        const out = smooth((t - this.outFrom) / Math.max(1, this.shutAt - this.outFrom));
        bulge -= 0.4 * fat * (hidden / this.boxed) * out;
      }
    }
    const go = this.tryAt(t);
    if (go) bulge += 0.07 * Math.sin(Math.PI * Math.min(1, Math.max(0, (go.u - 0.4) / 0.35)));
    return bulge + 0.04 * this.tugAt(t);
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

  /** Him at `t`: riding in, hopping off, at work on the box, hopping back on and riding off. */
  private himAt(t: number, ride: Ride, box: Box, dt: number): Him {
    const seat = toWorld(SEAT, ride.x, ride.y, ride.tilt);
    this.groundStand = follow(this.groundStand, this.groundAt(this.standX), dt, dt * RISE_PER_MS);
    const stand = { x: this.standX, y: this.groundStand - STAND_HIP };
    if (t < ARRIVE_MS) {
      const u = t / ARRIVE_MS;
      const brace = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - SKID_FROM) / (1 - SKID_FROM))));
      const pose = { ...SEATED, lean: SEATED.lean + 0.25 * (1 - u) - 0.3 * brace };
      return { x: seat.x, y: seat.y, turn: ride.tilt, pose, mouth: 0.6 * brace };
    }
    if (t < this.packFrom) {
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
    if (t < this.depart) return this.atWork(t, stand, ride, box, dt);
    const near = this.closeBy(stand, ride, box);
    if (t < this.mounted) {
      // Back on, in one leap.
      const u = smooth((t - this.depart) / HOP_ON_MS);
      return {
        x: near.x + (seat.x - near.x) * u,
        y: near.y + (seat.y - near.y) * u - 34 * Math.sin(Math.PI * u),
        turn: ride.tilt * u,
        pose: blendPose(blendPose(STANDING, cheer(t), 1 - u), SEATED, u),
        mouth: 1,
      };
    }
    const u = (t - this.mounted) / RIDE_MS;
    const pose = { ...SEATED, lean: SEATED.lean + 0.15 * smooth(u / 0.3) };
    return { x: seat.x, y: seat.y, turn: ride.tilt, pose, mouth: u < 0.4 ? 0.8 : 0 };
  }

  /** Where he stands to work on the box: just behind its back edge, wherever the scooter's tilt and the box's swelling put it. */
  private closeBy(stand: Point, ride: Ride, box: Box): Point {
    const back = toWorld(lidPoint(0, box.bulge, 0, 0), ride.x, ride.y, ride.tilt);
    return { x: back.x - BESIDE, y: stand.y };
  }

  /**
   * Him off the scooter: packing as fast as his arms go; jumping up to force the lid down and
   * being thrown off as it springs back; throwing the excess over his shoulder; slapping the lid
   * shut; and tying it down.
   */
  private atWork(t: number, stand: Point, ride: Ride, box: Box, dt: number): Him {
    const head = headTop(0);
    const close = this.closeBy(stand, ride, box);
    const onLid = (f: number) =>
      toWorld(lidPoint(f, box.bulge, box.lid, box.bow), ride.x, ride.y, ride.tilt);
    if (t < this.packedBy - TOSS_MS) {
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
    if (t < this.tryFrom) {
      // A step up to the box, sizing up the heap, hands rising.
      const u = smooth((t - (this.packedBy - TOSS_MS)) / (this.tryFrom - this.packedBy + TOSS_MS));
      const ready: Pose = {
        lean: 0.05,
        nearHand: { x: 10, y: -30 },
        farHand: { x: 6, y: -28 },
        nearFoot: { x: 5, y: STAND_HIP },
        farFoot: { x: -5, y: STAND_HIP },
      };
      return {
        x: stand.x + (close.x - stand.x) * u,
        y: stand.y,
        turn: 0,
        pose: blendPose(STANDING, ready, u),
        mouth: 0.2,
      };
    }
    const go = this.tryAt(t);
    if (go) return this.forcing(go.k, go.u, t, close, onLid(0.3));
    if (this.drops > 0 && t < this.outFrom) {
      // Glaring at it, hands on his hips, then wiping his brow.
      const u = (t - this.triedBy) / SIGH_MS;
      const pose: Pose = {
        lean: -0.12,
        nearHand: u < 0.5 ? { x: 7, y: -6 } : { x: 10, y: -38 },
        farHand: { x: -4, y: -6 },
        nearFoot: { x: 6, y: STAND_HIP },
        farFoot: { x: -6, y: STAND_HIP },
      };
      return {
        x: close.x - 10 * (1 - smooth(u)),
        y: close.y,
        turn: 0,
        pose: blendPose(STANDING, pose, smooth(u / 0.3)),
        mouth: 0.15,
      };
    }
    if (this.drops > 0 && t < this.shutAt) {
      // Plucking off the top two-handed, one hand after the other, and over his shoulder.
      const top = toWorld(
        { x: rimOf(box.bulge).x - 12, y: rimOf(box.bulge).y - 10 },
        ride.x,
        ride.y,
        ride.tilt,
      );
      const swing = 0.5 + 0.5 * Math.sin(((t - this.outFrom) / PLUCK_MS) * Math.PI);
      const lean = -0.1 + 0.12 * (swing - 0.5);
      const grab = { x: top.x - close.x, y: top.y - close.y };
      const rise = Math.min(6, riseToReach(grab, lean));
      grab.y += rise;
      const back = { x: -7, y: -44 };
      const mix = (a: Point, b: Point, u: number) => ({
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
      });
      this.sweat.stream(8, dt, () => this.sweatDrop(close.x + head.x, close.y - rise + head.y));
      return {
        x: close.x,
        y: close.y - rise,
        turn: 0,
        pose: {
          lean,
          nearHand: reachTo(mix(back, grab, swing), lean),
          farHand: reachTo(mix(grab, back, swing), lean),
          nearFoot: { x: 5, y: Math.min(29.5, STAND_HIP + rise) },
          farFoot: { x: -5, y: Math.min(29.5, STAND_HIP + rise) },
        },
        mouth: 0.4 + 0.3 * Math.sin(t * 0.06),
      };
    }
    if (this.drops > 0 && t < this.ropeFrom) {
      // Slapping the lid shut with both hands.
      return this.reaching(close, onLid(0.35), onLid(0.2), 0.2, 0.5);
    }
    return this.tying(t, close, ride, box);
  }

  /** Him at go `k` at the lid, `u` of the way through: jumping up, hanging on it with his legs kicking, then thrown off as it springs back. */
  private forcing(k: number, u: number, t: number, close: Point, grip: Point): Him {
    // Knocked back by the last go, he steps in again.
    const x = close.x - (k > 0 ? 10 * (1 - smooth(u / 0.3)) : 0);
    if (u < 0.3) {
      const crouch = 3 * Math.sin(Math.PI * Math.min(1, u / 0.12));
      const jump = MAX_RISE * smooth((u - 0.12) / 0.18);
      const y = close.y + crouch - jump;
      const aim = { x: grip.x - x, y: grip.y - 6 - y };
      const lift = smooth(u / 0.3);
      const pose: Pose = {
        lean: 0.2 * lift,
        nearHand: reachTo({ x: 10 + (aim.x - 10) * lift, y: -28 + (aim.y + 28) * lift }, 0.2),
        farHand: reachTo({ x: 6 + (aim.x - 8) * lift, y: -26 + (aim.y + 26) * lift }, 0.2),
        nearFoot: { x: 5, y: Math.min(29.5, STAND_HIP - crouch + jump) },
        farFoot: { x: -5, y: Math.min(29.5, STAND_HIP - crouch + jump) },
      };
      return { x, y, turn: 0, pose, mouth: 0.3 };
    }
    if (u < 0.68 || this.shutsOn(k)) {
      // Hanging on it, pushing down with both hands, legs kicking.
      const settle = this.shutsOn(k) ? smooth((u - 0.7) / 0.3) : 0;
      const him = this.reaching(
        { x, y: close.y },
        grip,
        { x: grip.x - 5, y: grip.y + 1 },
        0.3,
        0.6,
      );
      const kick = 4 * Math.sin(t * 0.07) * (1 - settle);
      him.pose.nearFoot = { x: 6 + kick, y: him.pose.nearFoot.y - 2 };
      him.pose.farFoot = { x: -6 - kick, y: him.pose.farFoot.y - 1 };
      him.y += 1.5 * Math.sin(t * 0.06) * (1 - settle);
      return settle > 0
        ? {
            ...him,
            y: him.y + (close.y - him.y) * settle,
            pose: blendPose(him.pose, STANDING, settle),
          }
        : him;
    }
    // Sprung off it: knocked back, arms flung up, yelling.
    const v = (u - 0.68) / 0.32;
    const from = this.reaching({ x, y: close.y }, grip, grip, 0.3, 0);
    const pose: Pose = {
      lean: 0.3 - 0.6 * Math.sin(Math.PI * Math.min(1, v * 1.4)),
      nearHand: { x: 8, y: -44 },
      farHand: { x: -6, y: -42 },
      nearFoot: { x: 8, y: STAND_HIP - 3 },
      farFoot: { x: -2, y: STAND_HIP - 1 },
    };
    return {
      x: x - 10 * easeOut(v),
      y: from.y + (close.y - from.y) * easeOut(v) - 6 * Math.sin(Math.PI * v),
      turn: 0,
      pose: blendPose(from.pose, pose, smooth(v / 0.3)),
      mouth: 0.95,
    };
  }

  /** Him reaching `near` and `far` (world points) with his hands, up on tiptoe or off the ground as he must, leaning `lean`. */
  private reaching(at: Point, near: Point, far: Point, lean: number, mouth: number): Him {
    const rel = (p: Point, y: number) => ({ x: p.x - at.x, y: p.y - y });
    const rise = Math.min(MAX_RISE, riseToReach(rel(near, at.y), lean));
    const y = at.y - rise;
    return {
      x: at.x,
      y,
      turn: 0,
      pose: {
        lean,
        nearHand: reachTo(rel(near, y), lean),
        farHand: reachTo(rel(far, y), lean),
        nearFoot: { x: 5, y: Math.min(29.5, STAND_HIP + rise) },
        farFoot: { x: -5, y: Math.min(29.5, STAND_HIP + rise) },
      },
      mouth,
    };
  }

  /** Him tying the box down: hauling each wrap round it hand over hand, working the knot, tugging it tight, then admiring it. */
  private tying(t: number, close: Point, ride: Ride, box: Box): Him {
    const r = this.ropeShare(t);
    const world = (p: Point) => toWorld(p, ride.x, ride.y, ride.tilt);
    if (t < this.ropeFrom) {
      // Nothing was over: he gets the rope out.
      return { x: close.x, y: close.y, turn: 0, pose: STANDING, mouth: 0 };
    }
    if (r < KNOT_AT) {
      // Feeding the rope over the lid with one hand, hauling on it with the other.
      const k = r < WRAP_2 ? 0 : 1;
      const top = world(ropePoint(k, 0, box.bulge, box.lid, box.bow));
      const haul = Math.sin(t * 0.03);
      const him = this.reaching(close, top, top, 0.12, 0.3);
      him.pose.farHand = { x: 2 - 6 * haul, y: -22 + 3 * haul };
      return him;
    }
    const knot = world(knotPoint(box.bulge, box.lid, box.bow));
    if (r < TUG_AT) {
      // Working the knot with both hands, tongue out.
      const jiggle = 2 * Math.sin(t * 0.09);
      return this.reaching(
        close,
        { x: knot.x + jiggle, y: knot.y },
        { x: knot.x - 3 - jiggle, y: knot.y + 1 },
        0.18,
        0.25,
      );
    }
    if (r < 1) {
      // A good hard tug on both ends.
      const tug = this.tugAt(t);
      const him = this.reaching(close, knot, knot, 0.18, 0.6);
      const back: Pose = {
        lean: -0.35,
        nearHand: { x: -1, y: -28 },
        farHand: { x: -4, y: -26 },
        nearFoot: { x: 8, y: STAND_HIP },
        farFoot: { x: -2, y: STAND_HIP },
      };
      return {
        x: close.x - 4 * tug,
        y: close.y,
        turn: 0,
        pose: blendPose(him.pose, back, tug),
        mouth: 0.6,
      };
    }
    // Dusting off his hands, pleased with it.
    const clap = Math.abs(Math.sin(t * 0.04)) * 3;
    return {
      x: close.x,
      y: close.y,
      turn: 0,
      pose: {
        lean: -0.06,
        nearHand: { x: 9 + clap, y: -14 },
        farHand: { x: 6 - clap, y: -13 },
        nearFoot: { x: 4, y: STAND_HIP },
        farFoot: { x: -4, y: STAND_HIP },
      },
      mouth: 0,
    };
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

  /** A burst of sweat off his helmet, wherever he is. */
  private sweatBurst(n: number): void {
    const head = headTop(0);
    const x = this.hipX + head.x;
    const y = this.hipY + head.y;
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

/** 0 to 1 like a spring let go: fast, past 1, and back. */
function springy(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return 1 - Math.exp(-6 * c) * Math.cos(9 * c);
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
