import { type Board, pick, type Removal, type Remover, type ScoopShape } from '../board';

// Timing in ms, geometry in world pixels.
/** The hole's radius when fully open, and how far above the clump's top its middle is. */
const HOLE_R = 20;
const ABOVE = 90;
const MIN_Y = 60;
/** It opens over this long, and collapses over this long before it pops. */
const OPEN_MS = 650;
const COLLAPSE_MS = 420;
const POP_MS = 380;
/** Icons start spiralling in over this long, each taking a while to fall all the way in. */
const STAGGER_MS = 900;
const FALL_MIN_MS = 900;
const FALL_MORE_MS = 500;
/** How many times round an icon goes on its way in, at least and at most. */
const TURNS_MIN = 1.3;
const TURNS_MORE = 1.2;
/** A dud is flung out this far into its fall, this fast (px per second) along its path. */
const FLING_AT = 0.45;
const FLING_SPEED = 320;
/** Where it can aim, as fractions of the canvas's width. */
const AIM_FROM = 0.25;
const AIM_TO = 0.75;

/** A black hole's colours: the glow around it, its accretion disk, and the rim of its horizon. */
export interface BlackHolePalette {
  glow: string;
  disk: string;
  rim: string;
}

export const BLACK_HOLE_PALETTES: readonly BlackHolePalette[] = [
  // Violet, with a molten disk.
  { glow: '#7C3AED', disk: '#F59E0B', rim: '#F0ABFC' },
  // Deep blue, with a pale gold disk.
  { glow: '#0EA5E9', disk: '#FDE68A', rim: '#A5F3FC' },
  // Crimson.
  { glow: '#BE123C', disk: '#FB923C', rim: '#FECDD3' },
  // Emerald.
  { glow: '#059669', disk: '#A3E635', rim: '#BBF7D0' },
];

interface Options {
  /** The colours to pick from for each removal; the first until the first pick. */
  palettes?: readonly BlackHolePalette[];
}

/**
 * A black hole (黑洞) opens over a clump of the pile and swallows it, the icons spiralling in
 * and shrinking as they go; the duds it flings back out on the swing, and then it collapses
 * with a pop.
 */
export class BlackHole implements Remover {
  readonly name = 'black-hole';
  private readonly palettes: readonly BlackHolePalette[];

  constructor({ palettes = BLACK_HOLE_PALETTES }: Options = {}) {
    this.palettes = palettes;
  }

  /** A clump of the pile somewhere across it. */
  shape(rng: () => number): ScoopShape {
    return { kind: 'clump', at: AIM_FROM + (AIM_TO - AIM_FROM) * rng() };
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Swallow(board, now, rng, pick(this.palettes, rng));
  }
}

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

/** One swallowing. */
class Swallow implements Removal {
  private readonly t0: number;
  private readonly cx: number;
  private readonly cy: number;
  /** When it starts to collapse, and when it is all over, in ms after `t0`. */
  private readonly collapse: number;
  private readonly done: number;
  /** Each icon's start, its distance and angle from the middle then, how long it falls and how many turns it makes. */
  private readonly startAt: Float32Array;
  private readonly fallMs: Float32Array;
  private readonly r0: Float32Array;
  private readonly a0: Float32Array;
  private readonly turns: Float32Array;
  /** Whether each is a dud, to fling out, and whether it has gone in or been flung. */
  private readonly dud: Uint8Array;
  private readonly finished: Uint8Array;

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    private readonly palette: BlackHolePalette,
  ) {
    const { icons, world } = board;
    const n = icons.length;
    this.t0 = now;
    let sumX = 0;
    let top = Infinity;
    for (const { x, y } of icons) {
      sumX += x;
      top = Math.min(top, y);
    }
    this.cx = Math.min(world.width - 50, Math.max(50, sumX / n));
    this.cy = Math.max(MIN_Y, top - ABOVE);
    this.startAt = new Float32Array(n);
    this.fallMs = new Float32Array(n);
    this.r0 = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.turns = new Float32Array(n);
    this.dud = new Uint8Array(n);
    this.finished = new Uint8Array(n);
    let lastIn = OPEN_MS;
    icons.forEach(({ x, y }, i) => {
      // The nearest go first.
      const r = Math.hypot(x - this.cx, y - this.cy);
      this.r0[i] = r;
      this.a0[i] = Math.atan2(y - this.cy, x - this.cx);
      this.startAt[i] = OPEN_MS * 0.6 + STAGGER_MS * (0.5 * Math.min(1, r / 200) + 0.5 * rng());
      this.fallMs[i] = FALL_MIN_MS + FALL_MORE_MS * rng();
      this.turns[i] = TURNS_MIN + TURNS_MORE * rng();
      lastIn = Math.max(lastIn, this.startAt[i] + this.fallMs[i]);
    });
    for (let k = 0; k < board.dropCount; k++) this.dud[Math.floor((k * n) / board.dropCount)] = 1;
    this.collapse = lastIn;
    this.done = this.collapse + COLLAPSE_MS + POP_MS;
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  /** Where icon `i` is, `u` of the way in, and its velocity there in px per second. */
  private spiral(i: number, u: number): { x: number; y: number; vx: number; vy: number } {
    const e = u * u * (3 - 2 * u);
    const r = this.r0[i]! * (1 - e);
    // Anticlockwise on screen (y down), so a negative angle.
    const a = this.a0[i]! - this.turns[i]! * Math.PI * 2 * e;
    const x = this.cx + Math.cos(a) * r;
    const y = this.cy + Math.sin(a) * r;
    // Along its path: inwards and round.
    const tx = Math.sin(a);
    const ty = -Math.cos(a);
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    return { x, y, vx: (tx + ox * 0.4) * FLING_SPEED, vy: (ty + oy * 0.4) * FLING_SPEED };
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now - this.t0;
    const { board } = this;
    // How open it is: opening, open, then collapsing.
    const open = t < OPEN_MS ? smooth(t / OPEN_MS) : 1 - smooth((t - this.collapse) / COLLAPSE_MS);
    if (open > 0) this.drawHole(ctx, open, t);
    if (t >= this.collapse + COLLAPSE_MS)
      this.drawPop(ctx, (t - this.collapse - COLLAPSE_MS) / POP_MS);

    const n = board.icons.length;
    for (let i = 0; i < n; i++) {
      if (this.finished[i] || t < this.startAt[i]!) continue;
      const at = board.take(i);
      if (at) {
        this.r0[i] = Math.hypot(at.x - this.cx, at.y - this.cy);
        this.a0[i] = Math.atan2(at.y - this.cy, at.x - this.cx);
      }
      const u = Math.min(1, (t - this.startAt[i]!) / this.fallMs[i]!);
      const p = this.spiral(i, Math.min(u, this.dud[i] ? FLING_AT : 1));
      if (this.dud[i] && u >= FLING_AT) {
        this.finished[i] = 1;
        board.drop(i, p.x, p.y, p.vx, p.vy);
        continue;
      }
      if (u >= 1) {
        this.finished[i] = 1;
        continue;
      }
      board.stamp(p.x, p.y, 1 - 0.8 * smooth((u - 0.4) / 0.6));
    }
  }

  /** The glow, the spinning disk and the dark horizon, `open` from 0 to 1. */
  private drawHole(ctx: CanvasRenderingContext2D, open: number, t: number): void {
    const { cx, cy, palette } = this;
    const r = HOLE_R * open;
    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, r, cx, cy, r * 4);
    glow.addColorStop(0, palette.glow);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 0.55 * open;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 4, 0, Math.PI * 2);
    ctx.fill();
    // The accretion disk, tilted towards us, with streaks going round.
    ctx.globalAlpha = open;
    ctx.strokeStyle = palette.disk;
    ctx.lineWidth = 3 * open;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 2.4, r * 0.7, -0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 9]);
    ctx.lineDashOffset = -t / 12;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.8, r * 0.52, -0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // The horizon.
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** The pop as it goes: a flash and a ring, `u` from 0 to 1. */
  private drawPop(ctx: CanvasRenderingContext2D, u: number): void {
    if (u >= 1) return;
    const { cx, cy, palette } = this;
    ctx.save();
    ctx.globalAlpha = 1 - u;
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 3 * (1 - u);
    ctx.beginPath();
    ctx.arc(cx, cy, 6 + 46 * smooth(u), 0, Math.PI * 2);
    ctx.stroke();
    const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
    flash.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    flash.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
