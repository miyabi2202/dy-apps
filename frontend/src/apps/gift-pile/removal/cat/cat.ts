import { type Board, pick, type Removal, type Remover } from '../board';

// Timing in ms, geometry in world pixels.
/** How fast the cat walks, and how far its stride is. */
const SPEED = 0.11;
const STRIDE = 9;
/** It comes in this far past the right edge, and is gone this far past the left. */
const ENTER = 70;
const EXIT = 110;
/** Its paw reaches this far ahead of it. */
const REACH = 28;
/** A batted icon's speed (px per ms) up and to the left, from at least the first value plus up to the second. */
const BAT_VX = [0.32, 0.26] as const;
const BAT_VY = [0.42, 0.32] as const;
/** A dud gets a gentler tap, and is let go into the physics this soon after. */
const DUD_VX = [0.1, 0.12] as const;
const DUD_VY = [0.22, 0.16] as const;
const DUD_LET_GO_MS = 70;
/** Gravity on batted icons, in px per ms². */
const GRAVITY = 0.0011;
/** How long a swipe of the paw takes. */
const SWIPE_MS = 220;
/** The pile's top is sampled this often across, and smoothed over this many samples either side. */
const SAMPLE = 8;
const SMOOTH = 2;

/** A cat's coat: its fur and outline and eyes, and any stripes, darker points, or white chest. */
export interface CatCoat {
  fur: string;
  outline: string;
  eye: string;
  stripes?: string;
  points?: string;
  chest?: string;
}

export const CAT_COATS: readonly CatCoat[] = [
  // Ginger tabby.
  { fur: '#FB923C', outline: '#7C2D12', eye: '#84CC16', stripes: '#C2410C' },
  // Grey tabby.
  { fur: '#94A3B8', outline: '#1E293B', eye: '#FACC15', stripes: '#475569' },
  // Snow white.
  { fur: '#F8FAFC', outline: '#94A3B8', eye: '#38BDF8' },
  // Tuxedo, outlined light so it shows against the dark.
  { fur: '#1F2937', outline: '#CBD5E1', eye: '#FACC15', chest: '#F8FAFC' },
  // Siamese.
  { fur: '#FEF3C7', outline: '#78350F', eye: '#3B82F6', points: '#78350F' },
];

interface Options {
  /** The coats to pick from for each walk; the first until the first pick. */
  coats?: readonly CatCoat[];
}

/**
 * A cat (猫猫) walks in from the right along the top of the pile and bats every icon in its
 * way off to the left, out of sight; the duds it only taps, and they tumble back onto the
 * pile.
 */
export class Cat implements Remover {
  readonly name = 'cat';
  private readonly coats: readonly CatCoat[];

  constructor({ coats = CAT_COATS }: Options = {}) {
    this.coats = coats;
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Walk(board, now, rng, pick(this.coats, rng));
  }
}

const bump = (u: number) => (u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0);

/** A batted icon in the air. */
interface Flying {
  i: number;
  at: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dud: boolean;
}

/** One walk across. */
class Walk implements Removal {
  private readonly t0: number;
  /** The top of the pile across the canvas, every `SAMPLE` px. */
  private readonly ground: Float32Array;
  /** The icons by x, rightmost first, as the cat reaches them, and how many it has reached. */
  private readonly ahead: number[];
  private reached = 0;
  private readonly duds = new Set<number>();
  private flying: Flying[] = [];
  private lastSwipe = -Infinity;

  constructor(
    private readonly board: Board,
    now: number,
    private readonly rng: () => number,
    private readonly coat: CatCoat,
  ) {
    const { icons, world, iconRadius } = board;
    this.t0 = now;
    // The top of the pile: the highest icon near each sample, smoothed so the cat doesn't jolt.
    const n = Math.ceil(world.width / SAMPLE) + 1;
    const raw = new Float32Array(n).fill(Infinity);
    for (const { x, y } of icons) {
      const from = Math.max(0, Math.floor((x - 2 * iconRadius) / SAMPLE));
      const to = Math.min(n - 1, Math.ceil((x + 2 * iconRadius) / SAMPLE));
      for (let k = from; k <= to; k++) raw[k] = Math.min(raw[k]!, y - iconRadius);
    }
    const floor = Math.max(...icons.map((p) => p.y), world.height * 0.8);
    for (let k = 0; k < n; k++) if (!Number.isFinite(raw[k]!)) raw[k] = floor;
    this.ground = raw.map((_, k) => {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, k - SMOOTH); j <= Math.min(n - 1, k + SMOOTH); j++) {
        sum += raw[j]!;
        count++;
      }
      return sum / count;
    });
    this.ahead = icons.map((_, i) => i).sort((a, b) => icons[b]!.x - icons[a]!.x);
    // The duds are spread along the way.
    const len = this.ahead.length;
    for (let k = 0; k < board.dropCount; k++)
      this.duds.add(this.ahead[Math.floor((k * len) / board.dropCount)]!);
  }

  /** The cat's x at `t`. */
  private xAt(t: number): number {
    return this.board.world.width + ENTER - SPEED * t;
  }

  /** The top of the pile under x. */
  private groundAt(x: number): number {
    const k = Math.min(this.ground.length - 1, Math.max(0, x / SAMPLE));
    const k0 = Math.floor(k);
    const k1 = Math.min(this.ground.length - 1, k0 + 1);
    return this.ground[k0]! + (this.ground[k1]! - this.ground[k0]!) * (k - k0);
  }

  isOver(now: number): boolean {
    return this.xAt(now - this.t0) < -EXIT && this.flying.length === 0;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now - this.t0;
    const { board } = this;
    const { height } = board.world;
    const x = this.xAt(t);

    // Bat every icon the paw has reached.
    while (
      this.reached < this.ahead.length &&
      board.icons[this.ahead[this.reached]!]!.x >= x - REACH
    ) {
      const i = this.ahead[this.reached++]!;
      const from = board.take(i) ?? board.icons[i]!;
      const dud = this.duds.has(i);
      const [vx0, vxr] = dud ? DUD_VX : BAT_VX;
      const [vy0, vyr] = dud ? DUD_VY : BAT_VY;
      this.flying.push({
        i,
        at: t,
        x: from.x,
        y: from.y,
        vx: -(vx0 + vxr * this.rng()),
        vy: -(vy0 + vyr * this.rng()),
        dud,
      });
      this.lastSwipe = t;
    }

    // The icons in the air: duds are let go into the physics, the rest fly off and are gone.
    this.flying = this.flying.filter((f) => {
      const u = t - f.at;
      const fx = f.x + f.vx * u;
      const fy = f.y + f.vy * u + 0.5 * GRAVITY * u * u;
      if (f.dud && u >= DUD_LET_GO_MS) {
        board.drop(f.i, fx, fy, f.vx * 1000, (f.vy + GRAVITY * u) * 1000);
        return false;
      }
      if (fx < -30 || fy > height + 30) {
        board.destroy(f.i);
        return false;
      }
      board.stamp(fx, fy);
      return true;
    });

    if (x > -EXIT) this.drawCat(ctx, x, this.groundAt(x), t);
  }

  /** The cat facing left, its feet on the ground at (x, y), walking `t` ms in. */
  private drawCat(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const { coat } = this;
    const phase = ((this.board.world.width + ENTER - x) / STRIDE) % (Math.PI * 2);
    const swipe = bump((t - this.lastSwipe) / SWIPE_MS);
    const by = y - 22 - Math.abs(Math.sin(phase)) * 1.2;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = coat.outline;
    ctx.lineWidth = 1.5;

    // Tail, swishing.
    const swish = Math.sin(t / 260) * 6;
    ctx.strokeStyle = coat.outline;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + 26, by - 4);
    ctx.quadraticCurveTo(x + 46, by - 10, x + 40 + swish, by - 32);
    ctx.stroke();
    ctx.strokeStyle = coat.points ?? coat.fur;
    ctx.lineWidth = 4.5;
    ctx.stroke();

    // Legs: back pair, then the front pair, the near front one swiping.
    const leg = (lx: number, swing: number, colour: string) => {
      ctx.save();
      ctx.translate(lx, by + 6);
      ctx.rotate(swing);
      ctx.strokeStyle = coat.outline;
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 15);
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    };
    const paw = coat.points ?? coat.fur;
    leg(x + 18, Math.sin(phase + Math.PI) * 0.35, paw);
    leg(x - 10, Math.sin(phase) * 0.35, paw);

    // Body.
    ctx.fillStyle = coat.fur;
    ctx.strokeStyle = coat.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x + 6, by, 24, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (coat.stripes) {
      ctx.strokeStyle = coat.stripes;
      ctx.lineWidth = 2.5;
      for (const sx of [-2, 7, 16]) {
        ctx.beginPath();
        ctx.moveTo(x + sx, by - 10);
        ctx.quadraticCurveTo(x + sx + 3, by - 4, x + sx + 1, by + 1);
        ctx.stroke();
      }
    }
    if (coat.chest) {
      ctx.fillStyle = coat.chest;
      ctx.beginPath();
      ctx.ellipse(x - 12, by + 3, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    leg(x + 12, Math.sin(phase) * 0.35, paw);
    leg(x - 16, swipe > 0 ? -1.35 * swipe : Math.sin(phase + Math.PI) * 0.35, paw);

    // Head, with its ears, eyes, nose and whiskers.
    const hx = x - 20;
    const hy = by - 11;
    for (const [ax, tipX, bx] of [
      [-10, -8, -2],
      [2, 7, 10],
    ] as const) {
      ctx.fillStyle = coat.points ?? coat.fur;
      ctx.strokeStyle = coat.outline;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx + ax, hy - 6);
      ctx.lineTo(hx + tipX, hy - 17);
      ctx.lineTo(hx + bx, hy - 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#F9A8D4';
      ctx.beginPath();
      ctx.moveTo(hx + ax + 2, hy - 7);
      ctx.lineTo(hx + tipX, hy - 13);
      ctx.lineTo(hx + bx - 2, hy - 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = coat.fur;
    ctx.strokeStyle = coat.outline;
    ctx.beginPath();
    ctx.arc(hx, hy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (coat.points) {
      ctx.fillStyle = coat.points;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(hx - 4, hy + 3, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Eyes: blinking now and then.
    const blink = t % 2600 < 120 ? 0.2 : 1;
    for (const ex of [-6, 2]) {
      ctx.fillStyle = coat.eye;
      ctx.beginPath();
      ctx.ellipse(hx + ex, hy - 1, 2.6, 2.8 * blink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.ellipse(hx + ex - 0.6, hy - 1, 0.9, 2.2 * blink, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#F472B6';
    ctx.beginPath();
    ctx.moveTo(hx - 11, hy + 3);
    ctx.lineTo(hx - 8, hy + 3);
    ctx.lineTo(hx - 9.5, hy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const wy of [3, 6]) {
      ctx.moveTo(hx - 9, hy + wy);
      ctx.lineTo(hx - 22, hy + wy - 2 + (wy - 3));
    }
    ctx.stroke();
    ctx.restore();
  }
}
