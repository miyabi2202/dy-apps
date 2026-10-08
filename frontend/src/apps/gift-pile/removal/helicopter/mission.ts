import type { Board, Point, Removal } from '../board';
import { PileTop } from '../kit/pile-top';
import type { Recolour, SvgArt } from '../kit/svg-art';
import { drawChopper, WINCH } from './chopper';
import {
  drawHose,
  drawRope,
  drawSuction,
  drawWinchman,
  HANDS_UP,
  LUMP_MS,
  NOZZLE,
  tankAt,
} from './winchman';
import { easeOut, smooth } from '../kit/easing';
import { Clock } from '../kit/clock';

// Timing in ms, geometry in world pixels.
/** It hovers this far above the top of the pile, by the cabin's middle, but no higher than this on the canvas. */
const HOVER_ABOVE = 150;
const HOVER_MIN_Y = 50;
/** It flies in over this long, and away over this long. */
const ARRIVE_MS = 1500;
const LEAVE_MS = 1600;
/** The rope goes down and up at this many px per ms. */
const WINCH_SPEED = 0.25;
/** He drops this last bit off the rope onto the pile, and grabs it this far up on his way back. */
const LET_GO = 6;
/** He walks at this many px per ms, the length of the pile and back, this far in from each end. */
const WALK_SPEED = 0.24;
const END_MARGIN = 6;
/**
 * His vacuum takes icons within this far either side of its nozzle and above it, and this
 * far down into the pile below it, each flying in over this long.
 */
const SUCK_R = 22;
const SUCK_DEPTH = 48;
const SUCK_MS = 220;
/** His feet settle onto the top of the pile over about this long, so he doesn't jolt as it changes. */
const SETTLE_MS = 120;
/** Lifted this far off the pile, it is too heavy: it sinks this far over this long, throws out what is too much over this long, and rises back. */
const LIFT_FIRST = 40;
const SINK = 28;
const SINK_MS = 500;
const THROW_MS = 600;
const RECOVER_MS = 500;
/** What it throws out flies off this fast, in px per second, from at least the first value plus up to the second. */
const THROW_VX = [120, 120] as const;
const THROW_VY = [60, 120] as const;

/** Where the mission is. */
type Phase =
  | 'arrive' // flying in from the left to the middle
  | 'lower' // the rope going down with him on it
  | 'work' // walking the pile, vacuuming
  | 'return' // walking back to the rope
  | 'lift' // being winched up off the pile
  | 'sink' // the helicopter sagging under the weight
  | 'throw' // what is too much going out of the door
  | 'recover' // the helicopter rising back
  | 'reel' // winched the rest of the way up
  | 'leave' // flying off to the right
  | 'done';

/**
 * One trip of the helicopter. It flies in from the left and stops over the middle of the
 * pile; a winchman goes down the rope with a vacuum on his back, its hose up to the
 * helicopter, lets go onto the pile and walks it end to end on top of it as it is, until he has
 * vacuumed up all the board's icons. He goes back to the rope and is winched up; if some are
 * to be dropped, the helicopter sags under the weight, throws them out of the door and rises
 * back; then he is winched in and it flies off to the right. Every icon he vacuums is gone at
 * once, except the last `dropCount`, which go up the hose to be thrown out.
 */
export class Mission implements Removal {
  private phase: Phase = 'arrive';
  /** How long the mission has gone, and how long into this phase, in ms. */
  private readonly clock = new Clock();
  private phaseT = 0;
  private readonly t0: number;
  /** The top of the pile as it was, for before the pile's own can be asked, or where there is none. */
  private readonly top: PileTop;
  private readonly iconR: number;
  private readonly lowest: number;
  /** Where it hovers, by the cabin's middle, and where it is. */
  private readonly hoverX: number;
  private readonly hoverY: number;
  private chopper: Point;
  private tilt = 0.12;
  /** How far down the rope is let out from the winch. */
  private rope = 0;
  /** The winchman's feet, which way he faces, how far into his stride, and how much lower than the pile's first top he works. */
  private man: Point;
  private facing: 1 | -1 = -1;
  private stride = 0;
  /** The ends of the pile he walks between. */
  private readonly leftEnd: number;
  private readonly rightEnd: number;
  /** Icons he has vacuumed, on their way into the nozzle, and the ones held to throw out. */
  private readonly sucked: Uint8Array;
  private suckedCount = 0;
  /** How many he has vacuumed on this walk along the pile, to tell when one finds none. */
  private suckedThisWalk = 0;
  private readonly flying: { i: number; at: number; from: Point }[] = [];
  private landedCount = 0;
  /** When each icon that reached the nozzle went into the hose, for its lump on the way up. */
  private lumps: number[] = [];
  private readonly held: number[] = [];
  private thrown = 0;

  constructor(
    private readonly board: Board,
    now: number,
    private readonly rng: () => number,
    private readonly art: SvgArt,
    private readonly scheme: Recolour,
  ) {
    const { icons, world, iconRadius } = board;
    this.t0 = now;
    this.iconR = iconRadius;
    this.top = new PileTop(icons, world.width, SUCK_R, 0);
    this.lowest = Math.max(0, ...icons.map((p) => p.y));
    this.hoverX = world.width / 2;
    this.hoverY = Math.max(HOVER_MIN_Y, this.groundAt(this.hoverX) - HOVER_ABOVE);
    this.chopper = { x: -90, y: this.hoverY - 40 };
    this.man = this.winch();
    const xs = icons.map((p) => p.x);
    this.leftEnd = Math.max(END_MARGIN, Math.min(...xs, this.hoverX) - END_MARGIN);
    this.rightEnd = Math.min(world.width - END_MARGIN, Math.max(...xs, this.hoverX) + END_MARGIN);
    this.sucked = new Uint8Array(icons.length);
  }

  /** The top of the pile at x as it is now, where his feet go. */
  private groundAt(x: number): number {
    return (this.board.topAt(x) ?? this.top.rowAt(x, 0)) - this.iconR;
  }

  /** The winch under the helicopter. */
  private winch(): Point {
    return { x: this.chopper.x + WINCH.x, y: this.chopper.y + WINCH.y };
  }

  isOver(): boolean {
    return this.phase === 'done';
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const target = now - this.t0;
    // Step it on in small steps, so it vacuums everything in its way however far apart the frames are.
    this.clock.advance(
      target,
      (dt) => {
        this.phaseT += dt;
        this.step(dt);
      },
      () => this.phase !== 'done',
    );
    const { t } = this.clock;
    const onRope =
      this.phase === 'lower' ||
      this.phase === 'lift' ||
      this.phase === 'sink' ||
      this.phase === 'throw' ||
      this.phase === 'recover' ||
      this.phase === 'reel';
    const aboard = this.phase === 'arrive' || this.phase === 'leave' || this.phase === 'done';
    const bob = aboard ? 0 : Math.sin(t / 400) * 2;
    const chopper = { x: this.chopper.x, y: this.chopper.y + bob };
    const winch = { x: chopper.x + WINCH.x, y: chopper.y + WINCH.y };
    const man = onRope ? { x: winch.x, y: winch.y + this.rope + HANDS_UP } : this.man;

    if (!aboard) {
      const sucking = this.phase === 'work' || this.flying.length > 0 || this.lumps.length > 0;
      this.lumps = this.lumps.filter((at) => t - at < LUMP_MS);
      drawHose(
        ctx,
        { x: winch.x - 6, y: winch.y - 4 },
        tankAt(man, this.facing),
        t,
        sucking,
        this.lumps.map((at) => (t - at) / LUMP_MS),
      );
      drawRope(
        ctx,
        winch,
        onRope ? { x: winch.x, y: man.y - HANDS_UP } : { x: winch.x, y: winch.y + this.rope },
      );
    }
    drawChopper(ctx, this.art, this.scheme, chopper, this.tilt, t);
    if (!aboard)
      drawWinchman(ctx, man, { facing: this.facing, stride: this.stride, hanging: onRope });
    if (this.phase === 'work') drawSuction(ctx, this.nozzle(), this.facing, t);

    // Icons on their way into the nozzle.
    const nozzle = this.nozzle();
    for (const f of this.flying) {
      const u = Math.min(1, (t - f.at) / SUCK_MS);
      const e = u * u;
      this.board.stamp(
        f.from.x + (nozzle.x - f.from.x) * e,
        f.from.y + (nozzle.y - f.from.y) * e,
        1 - 0.6 * u,
      );
    }
  }

  /** His nozzle, ahead of his feet. */
  private nozzle(): Point {
    return { x: this.man.x + NOZZLE.x * this.facing, y: this.man.y - NOZZLE.y };
  }

  private next(phase: Phase): void {
    this.phase = phase;
    this.phaseT = 0;
  }

  /** Move everything on by `dt` ms. */
  private step(dt: number): void {
    const { board } = this;
    this.land();
    switch (this.phase) {
      case 'arrive': {
        const u = Math.min(1, this.phaseT / ARRIVE_MS);
        const e = easeOut(u);
        this.chopper = {
          x: -90 + (this.hoverX + 90) * e,
          y: this.hoverY - 40 + 40 * e,
        };
        this.tilt = 0.12 * (1 - e);
        if (u >= 1) this.next('lower');
        break;
      }
      case 'lower': {
        // Down until his feet are just above the pile, then he lets go.
        const toGround = this.groundAt(this.winch().x) - this.winch().y - HANDS_UP;
        this.rope = Math.min(toGround, this.rope + WINCH_SPEED * dt);
        if (this.rope >= toGround - LET_GO) {
          this.man = { x: this.winch().x, y: this.groundAt(this.winch().x) };
          this.facing = this.man.x - this.leftEnd < this.rightEnd - this.man.x ? -1 : 1;
          this.next('work');
        }
        break;
      }
      case 'work': {
        this.walk(dt);
        this.suck();
        const end = this.facing === 1 ? this.rightEnd : this.leftEnd;
        if ((this.man.x - end) * this.facing >= 0) {
          // The end of a walk along the pile: back the other way. A whole walk
          // that found none means the rest have moved out of his way: he takes them from here.
          if (this.suckedThisWalk === 0) this.suck(true);
          this.facing = this.facing === 1 ? -1 : 1;
          this.suckedThisWalk = 0;
        }
        if (this.suckedCount === board.icons.length && this.flying.length === 0)
          this.next('return');
        break;
      }
      case 'return': {
        const x = this.winch().x;
        this.facing = x >= this.man.x ? 1 : -1;
        this.walk(dt, x);
        if (Math.abs(this.man.x - x) < 0.5) {
          this.rope = this.man.y - HANDS_UP - this.winch().y;
          this.next('lift');
        }
        break;
      }
      case 'lift': {
        this.rope -= WINCH_SPEED * dt;
        if (this.phaseT >= LIFT_FIRST / WINCH_SPEED)
          this.next(this.held.length > 0 ? 'sink' : 'reel');
        break;
      }
      case 'sink': {
        const u = Math.min(1, this.phaseT / SINK_MS);
        this.chopper = { x: this.hoverX, y: this.hoverY + SINK * (1 - (1 - u) ** 2) };
        this.tilt = Math.sin(this.phaseT / 60) * 0.04;
        if (u >= 1) this.next('throw');
        break;
      }
      case 'throw': {
        const due = Math.min(
          this.held.length,
          Math.ceil((this.phaseT / THROW_MS) * this.held.length),
        );
        for (; this.thrown < due; this.thrown++) {
          const door = { x: this.chopper.x + 10, y: this.chopper.y + 4 };
          const side = this.rng() < 0.5 ? -1 : 1;
          board.drop(
            this.held[this.thrown]!,
            door.x,
            door.y,
            side * (THROW_VX[0] + THROW_VX[1] * this.rng()),
            -(THROW_VY[0] + THROW_VY[1] * this.rng()),
          );
        }
        if (this.thrown >= this.held.length) this.next('recover');
        break;
      }
      case 'recover': {
        const u = Math.min(1, this.phaseT / RECOVER_MS);
        this.chopper = { x: this.hoverX, y: this.hoverY + SINK * (1 - smooth(u)) };
        this.tilt = 0;
        if (u >= 1) this.next('reel');
        break;
      }
      case 'reel': {
        this.rope = Math.max(-HANDS_UP + 4, this.rope - WINCH_SPEED * dt);
        if (this.rope <= -HANDS_UP + 4) this.next('leave');
        break;
      }
      case 'leave': {
        const u = Math.min(1, this.phaseT / LEAVE_MS);
        const e = u * u;
        const { width } = board.world;
        this.chopper = {
          x: this.hoverX + (width + 110 - this.hoverX) * e,
          y: this.hoverY - 50 * e,
        };
        this.tilt = 0.14 * Math.min(1, u * 3);
        if (u >= 1) this.next('done');
        break;
      }
      case 'done':
        break;
    }
  }

  /** He walks on, towards `toward` (or on the way he faces), along the top of the pile as it is. */
  private walk(dt: number, toward?: number): void {
    const step = WALK_SPEED * dt;
    const x =
      toward === undefined
        ? this.man.x + this.facing * step
        : this.man.x +
          Math.sign(toward - this.man.x) * Math.min(step, Math.abs(toward - this.man.x));
    const ground = this.groundAt(x);
    this.man = { x, y: this.man.y + (ground - this.man.y) * Math.min(1, dt / SETTLE_MS) };
    this.stride += step / 4;
  }

  /**
   * Vacuum every icon by the nozzle, down into the pile below it; all that are left if `all`,
   * or once he is past the bottom of the pile.
   */
  private suck(all = false): void {
    const { board } = this;
    const nozzle = this.nozzle();
    const everything = all || this.man.y > this.lowest + this.iconR;
    const n = board.icons.length;
    for (let i = 0; i < n; i++) {
      if (this.sucked[i]) continue;
      const p = board.where(i) ?? board.icons[i]!;
      const dy = p.y - nozzle.y;
      const near = Math.abs(p.x - nozzle.x) <= SUCK_R && dy >= -SUCK_R && dy <= SUCK_DEPTH;
      if (!everything && !near) continue;
      this.sucked[i] = 1;
      this.suckedCount++;
      this.suckedThisWalk++;
      const from = board.take(i) ?? p;
      this.flying.push({ i, at: this.clock.t, from });
    }
  }

  /** Icons that have reached the nozzle go up the hose: gone, or the last few held to throw out. */
  private land(): void {
    const { board } = this;
    while (this.flying.length > 0 && this.clock.t - this.flying[0]!.at >= SUCK_MS) {
      const { i } = this.flying.shift()!;
      this.landedCount++;
      this.lumps.push(this.clock.t);
      if (this.landedCount > board.icons.length - board.dropCount) this.held.push(i);
      else board.destroy(i);
    }
  }
}
