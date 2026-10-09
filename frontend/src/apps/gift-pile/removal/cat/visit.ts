import type { Board, Gfx, Point, Removal, SpriteSource } from '../board';
import {
  anchorsOf,
  type CatLook,
  type CatPalette,
  catToWorld,
  drawCat,
  HEAD_TOP,
  STILL,
} from './body';
import { Flights } from './flights';
import { NEON_CYAN_RGB, NEON_MAGENTA_RGB } from './neon';
import { catPortrait } from './portrait';
import { drawSwoosh } from './shader';
import { easeOut, smooth } from '../kit/easing';
import { Clock, Frames } from '../kit/clock';
import { Emitter } from '../kit/particles';
import { PileTop } from '../kit/pile-top';

// Timing in ms, geometry in world pixels.
/** It walks in from this far off the left at this many px per ms, and saunters off at this many. */
const ENTER_FROM = -50;
const ENTER_SPEED = 0.13;
const LEAVE_SPEED = 0.12;
/** How far round its stride its legs go for each px it walks, in radians. */
const STRIDE_PER_PX = 0.16;
/** Its feet settle onto the top of the pile over about this long, so it doesn't jolt as the pile changes. */
const SETTLE_MS = 90;
/** It stands this far into the top of the pile, by the icons' middles, as their tops overlap. */
const SINK = 0.75;
/** It sits this far to the left of the first icon it pushes, which it picks nearest this far across. */
const TAP_REACH = 30;
const FIRST_AT = 0.62;
/** The first tap nudges that icon this far, the second this much further, each over this long. */
const NUDGE_1 = 9;
const NUDGE_2 = 15;
const NUDGE_MS = 170;
/** As it sits, that icon hops up out of the pile onto its top over this long, this high. */
const HOP_MS = 300;
const HOP = 10;
/** How long each beat of its act takes. */
const PHASE_MS: Partial<Record<Phase, number>> = {
  sit: 380,
  eye: 650,
  tap1: 460,
  stare1: 1150,
  tap2: 460,
  stare2: 1600,
  swat: 560,
  bored: 850,
  wiggle: 900,
  sweep: 650,
  turn: 240,
  meh: 1300,
  yawn: 1150,
  stretch: 1050,
};
/** Its paw lands this far through a tap, and through a swat. */
const TAP_HIT = 0.45;
const SWAT_RAISED = 0.45;
const SWAT_HIT = 0.55;
/** It sweeps a big swathe off ahead of it if at least this many are left once the first is gone, out to this far ahead. */
const SWEEP_MIN = 12;
const SWEEP_REACH = 125;
/** The big sweep's paw is raised by here and lands by here, through the sweep. */
const SWEEP_RAISED = 0.3;
const SWEEP_HIT = 0.42;
/** Walking the pile, it bats off what is this far ahead of its middle, and this far behind. */
const AHEAD = 32;
const BEHIND = 10;
/** Each row it walks is at least this far below the last, and it walks at most this many of them. */
const ROW_MIN = 40;
const MOST_ROWS = 7;
/** It turns this far in from either side. */
const END_MARGIN = 40;
/** Losing interest, it gives at most this many of the duds by its paw a half-hearted pat; the rest it just leaves. */
const LAZY_PATS = 5;
const LAZY_REACH = 36;
/** The view is kept moved to have it this far from its top and bottom, at least. */
const CAMERA_MARGIN = 90;

/** Where it is in its act. */
type Phase =
  | 'enter' // walking in along the top of the pile, tail up
  | 'sit' // sitting down by the first icon
  | 'eye' // looking down at it
  | 'tap1' // a tap of the paw: it moves a little
  | 'stare1' // staring at the viewer
  | 'tap2' // another tap, still staring at the viewer
  | 'stare2' // staring at the viewer for longer, a slow blink, '…'
  | 'swat' // a proper swat: off it goes
  | 'bored' // a look at the viewer, and up it gets
  | 'wiggle' // crouched, its rear wiggling
  | 'sweep' // one big sweep of the paw
  | 'zoom' // walking the pile end to end, lower each time, batting everything off
  | 'turn' // turning round at the end of a row
  | 'meh' // losing interest: it sits down, leaving the rest
  | 'yawn' // a huge yawn
  | 'stretch' // a long stretch
  | 'leave' // sauntering off, tail up
  | 'done';

/** A swat's smear: from when, how long, round where, the paw's way round, in the cat's own frame, and its colours at the paw and behind. */
interface Swoosh {
  at: number;
  ms: number;
  x: number;
  y: number;
  radius: number;
  thickness: number;
  from: number;
  to: number;
  facing: 1 | -1;
  head: string;
  tail: readonly [number, number, number];
}

/** The swat's smear goes from a pale cyan at the paw to magenta; the big sweep's the other way round. */
const SWAT_HEAD = '#c9fdff';
const SWEEP_HEAD = '#ffc4f3';
/** Its buddy blinks for this long every so often. */
const BLINK_EVERY = 2700;
const BLINK_MS = 150;

/**
 * One visit of the cat. It walks in along the top of the pile, sits by a gift, and stares at
 * the viewer while it pushes it, tap by tap, until a swat knocks it off the screen. With more
 * left it gets bored: one big sweep of the paw, then it walks the pile end to end, lower each
 * time, batting everything off, faster the more there is. Everything it bats flies off the
 * screen and is gone, except the last `dropCount`: when only those are left it loses interest
 * and sits down, patting one or two half-heartedly back onto the pile and leaving the rest
 * where they are. Then a yawn, a stretch, and off it saunters with its tail up. All the while
 * its drone buddy rides in the backpack on its back, and its screen says what it makes of it:
 * '…' and '?' as the cat stares (rising right up out of the backpack for a look), '!' at a
 * swat, '^ ^' at the zoomies and the stretch, and 'z z' at the yawn.
 */
export class Visit implements Removal {
  private readonly t0: number;
  private phase: Phase = 'enter';
  /** How long it has been in this phase, in ms. */
  private since = 0;
  /** The time it has been moved to, in ms after `t0`. */
  private readonly clock = new Clock();
  private readonly frames = new Frames();
  /** Where it is, on the ground between its feet, which way it faces, and where its legs are in their stride. */
  private x = ENTER_FROM;
  private feetY: number;
  private facing: 1 | -1 = 1;
  private stride = 0;
  /** Where it sits for its act. */
  private readonly perchX: number;
  /** The rows it walks: the top of the pile, and each lower one this far below the last. */
  private readonly rows: PileTop;
  private readonly rowStep: number;
  private readonly lowest: number;
  private row = 0;
  /** How fast it walks the pile, in px per ms, once it has got bored. */
  private speed = 0;
  /** How many it bats off for good (the rest are duds), and how many it has. */
  private readonly toBat: number;
  private batted = 0;
  /** The icons it has yet to deal with, in the first `left` places. */
  private readonly waiting: Int32Array;
  private left: number;
  /** The first icon, which it pushes tap by tap: which, where it was, and how far it has been pushed. */
  private readonly first: number;
  private firstFrom: Point = { x: 0, y: 0 };
  /** Where it sits on the top of the pile, by its middle, and when it hopped up there. */
  private firstGround = 0;
  private hopAt = 0;
  private nudgeFrom = 0;
  private nudgeTo = 0;
  private nudgeAt = -Infinity;
  private teeterAt = -Infinity;
  private holding = false;
  private readonly flights: Flights;
  private readonly swooshes: Swoosh[] = [];
  /** Where and when its paw last landed, for the little lines of the tap. */
  private readonly taps: { x: number; y: number; at: number; facing: 1 | -1 }[] = [];
  /** When it last batted something off as it walked, for its paw's swipes. */
  private lastBat = -Infinity;
  private introduced = false;
  private readonly dust: Emitter;
  private readonly portrait: SpriteSource;

  constructor(
    private readonly board: Board,
    now: number,
    private readonly rng: () => number,
    private readonly palette: CatPalette,
  ) {
    const { icons, world, iconRadius: r } = board;
    const n = icons.length;
    this.t0 = now;
    this.toBat = Math.max(0, n - board.dropCount);
    this.flights = new Flights(board, n);
    this.portrait = catPortrait(palette);
    this.dust = new Emitter(
      {
        capacity: 160,
        blend: 'normal',
        colorFrom: 'rgba(236, 226, 210, 0.3)',
        drag: 2.5,
        gravity: -30,
        sizeOverLife: (u) => 0.5 + u,
      },
      rng,
    );

    let highest = Infinity;
    let lowest = -Infinity;
    for (const p of icons) {
      highest = Math.min(highest, p.y);
      lowest = Math.max(lowest, p.y);
    }
    this.lowest = lowest;
    // Rows enough to get down through them all, but no more than `MOST_ROWS`; each covers half a
    // row above its line and half below, so the last reaches the lowest.
    const depth = lowest - highest + r;
    const rows = Math.min(MOST_ROWS, Math.max(1, Math.ceil(depth / ROW_MIN)));
    this.rowStep = Math.max(ROW_MIN, depth / Math.max(0.5, rows - 0.5));
    this.rows = new PileTop(icons, world.width, r, this.rowStep);

    // The first icon: one on top, nearest `FIRST_AT` across; it sits just to its left.
    let first = -1;
    let nearest = Infinity;
    icons.forEach((p, i) => {
      const d = Math.abs(p.x - FIRST_AT * world.width);
      if (p.y <= highest + 2.5 * r && d < nearest) {
        nearest = d;
        first = i;
      }
    });
    const aim = icons[Math.max(0, first)]!;
    this.perchX = Math.min(world.width - 50, Math.max(24, aim.x - TAP_REACH));
    this.first = this.toBat > 0 ? first : -1;
    this.waiting = new Int32Array(n);
    this.left = 0;
    for (let i = 0; i < n; i++) if (i !== this.first) this.waiting[this.left++] = i;
    this.feetY = this.surfaceAt(this.x);
  }

  isOver(): boolean {
    return this.phase === 'done' && this.flights.alive === 0;
  }

  draw(gfx: Gfx, now: number): void {
    // Move in small steps, so it bats off everything in its way however far apart the frames are.
    this.clock.advance(now - this.t0, (dt) => this.step(dt));
    const { t } = this.clock;
    const dt = this.frames.dt(t);
    const { board } = this;
    if (this.phase !== 'done' && this.phase !== 'leave') {
      board.camera.keepInView(this.feetY - 30, CAMERA_MARGIN);
    }
    const look = this.lookAt(t);

    // The first icon, pushed along under its paw, wobbling after the second tap.
    if (this.holding) {
      const at = this.firstAt(t);
      const since = t - this.teeterAt;
      const teeter =
        since > 0 && since < 4000 ? Math.sin(since * 0.024) * 0.24 * Math.exp(-since / 900) : 0;
      gfx.icon(at.x, at.y, 1, { rotation: teeter });
    }
    // What it has batted off, then the cat over it, so it isn't lost in a swarm of them.
    this.flights.draw(gfx, t);
    if (this.phase !== 'done') drawCat(gfx, this.palette, look);
    this.drawSwooshes(gfx, t);
    this.drawTaps(gfx, t);
    if (this.phase === 'zoom' && this.speed > 0.2) {
      this.dust.stream(60 + 100 * this.speed, dt, () => ({
        x: this.x - this.facing * (10 + 8 * this.rng()),
        y: this.feetY - 1 - 5 * this.rng(),
        vx: -this.facing * (30 + 50 * this.rng()),
        vy: -(10 + 30 * this.rng()),
        life: 450 + 300 * this.rng(),
        size: 12 + 10 * this.rng(),
      }));
    }
    this.dust.step(dt);
    this.dust.draw(gfx);
    if (this.phase === 'stare2' || this.phase === 'meh') this.drawDots(gfx, look);
  }

  /** Move it all on by `dt` ms. */
  private step(dt: number): void {
    if (this.phase === 'done') return;
    this.since += dt;
    const ms = PHASE_MS[this.phase] ?? Infinity;
    const crossed = (share: number) => this.since >= share * ms && this.since - dt < share * ms;
    const { t } = this.clock;
    const { board } = this;
    switch (this.phase) {
      case 'enter':
        this.walk(ENTER_SPEED, dt);
        if (this.x >= this.perchX) {
          this.x = this.perchX;
          this.go('sit');
        }
        break;
      case 'sit':
        // As it sits, the first icon hops up out of the pile onto its top, by its paw.
        if (!this.holding && this.first >= 0) {
          this.firstFrom = board.take(this.first) ?? board.icons[this.first]!;
          this.firstGround = this.feetY - board.iconRadius * 0.9;
          this.holding = true;
          this.hopAt = t;
        }
        break;
      case 'tap1':
        if (crossed(TAP_HIT)) this.nudge(NUDGE_1, t);
        break;
      case 'stare1':
        this.introduce();
        break;
      case 'tap2':
        if (crossed(TAP_HIT)) {
          this.nudge(NUDGE_1 + NUDGE_2, t);
          this.teeterAt = t;
        }
        break;
      case 'swat':
        if (crossed(SWAT_RAISED)) {
          this.swoosh(t, 210, 24, 12, -1.75, 0.55, SWAT_HEAD, NEON_MAGENTA_RGB);
        }
        if (crossed(SWAT_HIT)) {
          const at = this.firstAt(t);
          this.holding = false;
          this.flights.launch(this.first, at.x, at.y, 430, -330, 10, t);
          this.batted++;
          board.fx.shake(2, 140);
          this.puff(at.x, at.y, 5);
        }
        break;
      case 'sweep':
        if (crossed(SWEEP_RAISED)) {
          this.swoosh(t, 280, 34, 22, -1.95, 0.7, SWEEP_HEAD, NEON_CYAN_RGB);
        }
        if (crossed(SWEEP_HIT)) this.sweep(t);
        break;
      case 'zoom':
        this.walk(this.speed, dt);
        this.bat(t);
        if (this.batted >= this.toBat) {
          this.go('meh');
          break;
        }
        if (this.facing === 1 ? this.x >= this.rightEnd() : this.x <= END_MARGIN) {
          this.x = this.facing === 1 ? this.rightEnd() : END_MARGIN;
          this.row++;
          this.go('turn');
        }
        break;
      case 'turn':
        if (crossed(0.5)) this.facing = this.facing === 1 ? -1 : 1;
        break;
      case 'meh':
        this.introduce();
        if (crossed(0.1)) this.loseInterest();
        break;
      case 'leave':
        this.walk(LEAVE_SPEED, dt);
        if (this.x < -60 || this.x > board.world.width + 60) this.go('done');
        break;
      default:
        break;
    }
    const target = this.surfaceAt(this.x);
    this.feetY += (target - this.feetY) * (1 - Math.exp(-dt / SETTLE_MS));
    if (this.since >= ms) this.next();
  }

  /** On to the next beat of its act, when this one's time is up. */
  private next(): void {
    switch (this.phase) {
      case 'sit':
        return this.go('eye');
      case 'eye':
        return this.go(this.first >= 0 ? 'tap1' : 'meh');
      case 'tap1':
        return this.go('stare1');
      case 'stare1':
        return this.go('tap2');
      case 'tap2':
        return this.go('stare2');
      case 'stare2':
        return this.go('swat');
      case 'swat':
        return this.go(this.batted >= this.toBat ? 'meh' : 'bored');
      case 'bored':
        if (this.toBat - this.batted >= SWEEP_MIN) return this.go('wiggle');
        return this.startZoom();
      case 'wiggle':
        return this.go('sweep');
      case 'sweep':
        if (this.batted >= this.toBat) return this.go('meh');
        return this.startZoom();
      case 'turn':
        return this.go('zoom');
      case 'meh':
        return this.go('yawn');
      case 'yawn':
        return this.go('stretch');
      case 'stretch':
        this.facing = this.x > this.board.world.width / 2 ? 1 : -1;
        return this.go('leave');
      default:
        return;
    }
  }

  private go(phase: Phase): void {
    this.phase = phase;
    this.since = 0;
  }

  /** Bored of tapping: off along the pile, faster the more there is to bat off. */
  private startZoom(): void {
    const rest = this.toBat - this.batted;
    this.speed = rest <= 8 ? 0.12 : Math.min(0.5, 0.17 + rest / 2500);
    this.go('zoom');
  }

  /** The cut-in, once, as it first stares at the viewer. */
  private introduce(): void {
    if (this.introduced) return;
    this.introduced = true;
    this.board.fx.cutIn({ name: 'cat', color: '#f59e0b', portrait: this.portrait });
  }

  private rightEnd(): number {
    return this.board.world.width - END_MARGIN;
  }

  /** Walk on `speed` px per ms for `dt` ms the way it faces. */
  private walk(speed: number, dt: number): void {
    this.x += this.facing * speed * dt;
    this.stride += speed * dt * STRIDE_PER_PX;
  }

  /** Where its feet go at x: on the pile as it is now, or the floor if there is none there. */
  private surfaceAt(x: number): number {
    const { board } = this;
    const top = board.topAt(x) ?? board.world.height;
    return Math.min(top, board.world.height) - board.iconRadius * SINK;
  }

  /** Push the first icon on to `to` px from where it was, starting at `t`. */
  private nudge(to: number, t: number): void {
    this.nudgeFrom = this.shiftAt(t);
    this.nudgeTo = to;
    this.nudgeAt = t;
    const at = this.firstAt(t);
    this.taps.push({ x: at.x - this.board.iconRadius * 0.7, y: at.y - 4, at: t, facing: 1 });
  }

  private shiftAt(t: number): number {
    const u = easeOut((t - this.nudgeAt) / NUDGE_MS);
    return this.nudgeFrom + (this.nudgeTo - this.nudgeFrom) * u;
  }

  /** Where the first icon is at `t`: lifted a little out of the pile, pushed along to the right. */
  private firstAt(t: number): Point {
    const shift = this.shiftAt(t);
    const u = Math.min(1, (t - this.hopAt) / HOP_MS);
    const y = this.firstFrom.y + (this.firstGround - this.firstFrom.y) * smooth(u);
    return { x: this.firstFrom.x + shift, y: y - Math.sin(Math.PI * u) * HOP };
  }

  /** The big sweep: everything in a wide swathe ahead of it flies off in a fan. */
  private sweep(t: number): void {
    const { board, rng } = this;
    const f = this.facing;
    for (let k = 0; k < this.left && this.batted < this.toBat;) {
      const i = this.waiting[k]!;
      const p = board.where(i);
      const ahead = p ? (p.x - this.x) * f : 0;
      if (
        p &&
        ahead >= -BEHIND &&
        ahead <= SWEEP_REACH &&
        p.y <= this.rows.rowAt(p.x, 0) + this.rowStep / 2
      ) {
        const angle = -(0.3 + 0.95 * rng());
        const speed = 420 + 380 * rng();
        this.flights.launch(
          i,
          p.x,
          p.y,
          f * Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          f * (6 + 10 * rng()),
          t,
        );
        this.batted++;
        this.waiting[k] = this.waiting[--this.left]!;
        continue;
      }
      k++;
    }
    board.fx.shake(5, 300);
    board.fx.hitStop(70);
    this.puff(this.x + f * 40, this.feetY, 12);
  }

  /**
   * Bat off whatever is just ahead of it, from the top of the pile down to half a row below the
   * row it walks; once it is past the bottom of them, whatever is left, wherever it is.
   */
  private bat(t: number): void {
    const { board, rng } = this;
    const f = this.facing;
    const line = this.rows.rowAt(this.x, this.row);
    const bottom = line + this.rowStep / 2;
    const below = line - this.rowStep / 2 > this.lowest + board.iconRadius;
    for (let k = 0; k < this.left && this.batted < this.toBat;) {
      const i = this.waiting[k]!;
      const p = board.where(i);
      const ahead = p ? (p.x - this.x) * f : 0;
      if (p && (below || (ahead >= -BEHIND && ahead <= AHEAD && p.y <= bottom))) {
        const vx = f * (240 + 260 * rng());
        const vy = -(220 + 260 * rng());
        this.flights.launch(i, p.x, p.y, vx, vy, f * (5 + 9 * rng()), t);
        this.batted++;
        this.lastBat = t;
        this.waiting[k] = this.waiting[--this.left]!;
        continue;
      }
      k++;
    }
  }

  /**
   * Only duds are left and it has lost interest: the few by its paw get a half-hearted pat and
   * fall back onto the pile; the rest it just leaves where they are.
   */
  private loseInterest(): void {
    const { board, rng } = this;
    const f = this.facing;
    const pawX = this.x + f * 22;
    let pats = 0;
    for (let k = 0; k < this.left; k++) {
      const i = this.waiting[k]!;
      const p = board.where(i);
      if (!p) continue;
      const near = Math.abs(p.x - pawX) < LAZY_REACH && Math.abs(p.y - this.feetY) < 40;
      if (near && pats < LAZY_PATS) {
        pats++;
        board.drop(i, p.x, p.y - 4, f * (40 + 60 * rng()), -(130 + 90 * rng()));
      } else {
        board.drop(i, p.x, p.y);
      }
    }
    this.left = 0;
  }

  /** A swat's smear, round its shoulder as it is now, the paw going from `from` to `to` (in its own frame) over `ms`, `head` at the paw and `tail` behind. */
  private swoosh(
    t: number,
    ms: number,
    radius: number,
    thickness: number,
    from: number,
    to: number,
    head: string,
    tail: readonly [number, number, number],
  ): void {
    const look = this.lookAt(t);
    const a = anchorsOf(look.sit, look.crouch, 0);
    const at = catToWorld(look, { x: a.sx, y: a.sy });
    this.swooshes.push({
      at: t,
      ms,
      x: at.x,
      y: at.y,
      radius,
      thickness,
      from,
      to,
      facing: this.facing,
      head,
      tail,
    });
  }

  /** A little cloud of dust kicked up at (x, y). */
  private puff(x: number, y: number, n: number): void {
    const { rng } = this;
    this.dust.burst(n, () => ({
      x: x + (rng() - 0.5) * 16,
      y: y + (rng() - 0.5) * 6,
      vx: (rng() - 0.5) * 90,
      vy: -(20 + 50 * rng()),
      life: 450 + 350 * rng(),
      size: 9 + 7 * rng(),
    }));
  }

  private drawSwooshes(gfx: Gfx, t: number): void {
    for (let k = this.swooshes.length - 1; k >= 0; k--) {
      const s = this.swooshes[k]!;
      const u = (t - s.at) / s.ms;
      if (u >= 1) {
        this.swooshes.splice(k, 1);
        continue;
      }
      const head = s.from + (s.to - s.from) * easeOut(Math.min(1, u * 1.8));
      const reach = (head - s.from) * 0.95;
      // Mirrored when it faces left: the angle about the vertical, and the way round.
      const angle = s.facing === 1 ? head : Math.PI - head;
      const strength = 0.8 * (1 - smooth((u - 0.3) / 0.7));
      drawSwoosh(
        gfx,
        s.x,
        s.y,
        s.radius,
        s.thickness,
        angle,
        s.facing * reach,
        strength,
        s.head,
        s.tail,
      );
    }
  }

  /** Three little lines where a tap landed, as a comic draws one. */
  private drawTaps(gfx: Gfx, t: number): void {
    for (let k = this.taps.length - 1; k >= 0; k--) {
      const tap = this.taps[k]!;
      const u = (t - tap.at) / 260;
      if (u >= 1) {
        this.taps.splice(k, 1);
        continue;
      }
      const out = 5 + 7 * easeOut(u);
      for (const a of [-2.3, -1.6, -0.9]) {
        const c = Math.cos(a) * tap.facing;
        const s = Math.sin(a);
        gfx.line(
          tap.x + c * out,
          tap.y + s * out,
          tap.x + c * (out + 5),
          tap.y + s * (out + 5),
          1.8,
          '#d8feff',
          { alpha: 1 - u },
        );
      }
    }
  }

  /** '…' over its head, a dot at a time, as it stares. */
  private drawDots(gfx: Gfx, look: CatLook): void {
    const u = this.since / (PHASE_MS[this.phase] ?? 1);
    const a = anchorsOf(look.sit, look.crouch, look.stretch);
    const at = catToWorld(look, { x: a.headX, y: a.headY - HEAD_TOP - 5 });
    for (let k = 0; k < 3; k++) {
      const appear = smooth((u - 0.2 - 0.18 * k) / 0.06);
      if (appear <= 0) continue;
      gfx.circle(at.x + (k - 1) * 6.5, at.y, 2.3 * appear, '#ffffff', {
        stroke: { width: 1, color: this.palette.line },
      });
    }
  }

  /** How it looks at `t`, by the beat of its act. */
  private lookAt(t: number): CatLook {
    const u = this.since / (PHASE_MS[this.phase] ?? 1);
    const look: CatLook = {
      ...STILL,
      x: this.x,
      y: this.feetY,
      facing: this.facing,
      stride: this.stride,
      buddy: t % BLINK_EVERY < BLINK_MS ? 'blink' : 'idle',
      t,
    };
    switch (this.phase) {
      case 'enter':
      case 'leave':
        look.gait = 1;
        look.tailUp = 1;
        if (this.phase === 'leave') look.buddy = 'happy';
        break;
      case 'sit':
        look.sit = smooth(u);
        look.tailUp = 1 - smooth(u);
        break;
      case 'eye':
        look.sit = 1;
        look.headTilt = 0.32 * smooth(u / 0.3);
        break;
      case 'tap1':
      case 'tap2':
        look.sit = 1;
        look.face = this.phase === 'tap1' ? 'side' : 'front';
        look.headTilt = this.phase === 'tap1' ? 0.32 : 0.08;
        if (this.phase === 'tap2') {
          look.buddy = 'what';
          look.buddyLift = 0.2;
        }
        this.tapPaw(look, t, u);
        break;
      case 'stare1':
        look.sit = 1;
        look.face = 'front';
        look.headTilt = 0.06 * smooth(u / 0.5);
        // Its buddy peeks up out of the backpack: '…'.
        look.buddy = 'dots';
        look.buddyLift = 0.2 * smooth(u / 0.3);
        break;
      case 'stare2':
        look.sit = 1;
        look.face = u > 0.5 && u < 0.62 ? 'blink' : 'front';
        look.headTilt = 0.06 + 0.12 * smooth((u - 0.2) / 0.5);
        // Its buddy rises right up out of the backpack to see: '?'.
        look.buddy = 'what';
        look.buddyLift = 0.2 + 0.8 * smooth((u - 0.08) / 0.25) * (1 - smooth((u - 0.86) / 0.14));
        break;
      case 'swat':
        look.sit = 1 - 0.15 * Math.sin(Math.PI * u);
        look.headTilt = 0.25;
        this.swatPaw(look, u);
        look.buddy = 'alarm';
        look.buddyLift = 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.5) / 0.4)));
        break;
      case 'bored':
        look.face = 'front';
        look.sit = 1 - smooth((u - 0.6) / 0.4);
        break;
      case 'wiggle': {
        look.crouch = smooth(u / 0.25);
        look.wiggle = Math.sin(this.since * 0.032) * 3.5 * smooth((u - 0.2) / 0.2);
        look.headTilt = 0.1;
        look.buddy = 'alarm';
        break;
      }
      case 'sweep': {
        look.crouch = 1 - smooth(u / SWEEP_HIT);
        const a = anchorsOf(0, look.crouch, 0);
        const angle =
          u < SWEEP_RAISED
            ? 1.2 + (-1.95 - 1.2) * smooth(u / SWEEP_RAISED)
            : -1.95 + (0.7 + 1.95) * easeOut((u - SWEEP_RAISED) / (SWEEP_HIT - SWEEP_RAISED));
        look.paw = { x: a.sx + Math.cos(angle) * 30, y: a.sy + Math.sin(angle) * 30 };
        look.pawReach = smooth(u / 0.1) * (1 - smooth((u - 0.75) / 0.25));
        look.buddy = 'alarm';
        break;
      }
      case 'zoom': {
        const running = this.speed > 0.2;
        look.gait = running ? 1.3 : 1;
        look.bounce = running ? Math.abs(Math.sin(this.stride)) * 3 : 0;
        look.tailUp = running ? 0 : 1;
        look.tailFlat = running ? 1 : 0;
        if (running) look.buddy = 'happy';
        // Swiping away with a front paw while it bats things off.
        const swipe = Math.max(0, Math.sin(t * 0.03));
        const busy = 1 - smooth((t - this.lastBat - 150) / 200);
        const a = anchorsOf(0, 0, 0);
        look.paw = { x: a.sx + 20, y: a.sy + 14 - 10 * swipe };
        look.pawReach = swipe * busy;
        break;
      }
      case 'turn':
        look.gait = 0.6;
        look.tailUp = 0.5;
        break;
      case 'meh': {
        look.sit = smooth(u / 0.25);
        look.face = 'front';
        look.buddy = 'dots';
        // The half-hearted pat, as it sits down.
        const a = anchorsOf(look.sit, 0, 0);
        look.paw = { x: a.sx + 17, y: -4 };
        look.pawReach = 0.7 * Math.sin(Math.PI * Math.min(1, u / 0.22));
        break;
      }
      case 'yawn':
        look.sit = 1;
        look.face = u > 0.12 && u < 0.82 ? 'yawn' : 'front';
        look.headTilt = -0.22 * Math.sin(Math.PI * u);
        look.buddy = u > 0.12 ? 'sleep' : 'dots';
        break;
      case 'stretch':
        look.sit = 1 - smooth(u / 0.25);
        look.stretch = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.15) / 0.85)));
        look.face = look.stretch > 0.3 ? 'blink' : 'side';
        look.tailUp = Math.max(0.7 * look.stretch, smooth((u - 0.6) / 0.4));
        // Its buddy hops up out of the backpack while it stretches, pleased: '^ ^'.
        look.buddy = 'happy';
        look.buddyLift = Math.sin(Math.PI * u) * 0.9;
        break;
      default:
        break;
    }
    return look;
  }

  /** A tap: the paw reaches up and over onto the first icon, pushes, and comes back. */
  private tapPaw(look: CatLook, t: number, u: number): void {
    const target = this.holding
      ? this.firstAt(t)
      : (this.board.where(this.first) ?? this.firstFrom);
    const r = this.board.iconRadius;
    const contact = { x: target.x - r * 0.75 - this.x, y: target.y - r * 0.35 - this.feetY };
    const arc = u < TAP_HIT ? Math.sin((Math.PI * u) / TAP_HIT) * 9 : 0;
    look.paw = { x: contact.x, y: contact.y - arc };
    look.pawReach =
      u < TAP_HIT ? smooth(u / TAP_HIT) : 1 - smooth((u - TAP_HIT - 0.15) / (0.85 - TAP_HIT));
  }

  /** A swat: the paw wound right up over its head, then brought down hard through the icon. */
  private swatPaw(look: CatLook, u: number): void {
    const a = anchorsOf(look.sit, 0, 0);
    let angle: number;
    if (u < SWAT_RAISED) angle = 1.25 + (-1.75 - 1.25) * smooth(u / SWAT_RAISED);
    else if (u < SWAT_HIT + 0.02)
      angle = -1.75 + (0.55 + 1.75) * easeOut((u - SWAT_RAISED) / (SWAT_HIT + 0.02 - SWAT_RAISED));
    else angle = 0.55 + (1.25 - 0.55) * smooth((u - 0.7) / 0.3);
    look.paw = { x: a.sx + Math.cos(angle) * 24, y: a.sy + Math.sin(angle) * 24 };
    look.pawReach = smooth(u / 0.08) * (1 - smooth((u - 0.85) / 0.15));
  }
}
