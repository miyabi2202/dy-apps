import { type Board, pick, type Removal, type Remover } from '../board';
import { easeOut } from '../kit/easing';

// Timing in ms, geometry in world pixels.
/** At most this many rockets, launched over at most this long. */
const MAX_ROCKETS = 14;
const LAUNCH_EACH_MS = 260;
const LAUNCH_MAX_MS = 2600;
/** A rocket's icons gather at its foot this fast, then it climbs for this long. */
const GATHER_MS = 280;
const CLIMB_MS = 950;
/** The shell the icons gather into is as big as them all together, up to this many icons across. */
const SHELL_MAX = 3.2;
/** The burst: how long it lasts, how far it spreads, and how many sparks it throws. */
const BURST_MS = 1150;
const BURST_R = 62;
const SPARKS = 30;
/** How far the sparks sink under gravity by the end of the burst. */
const SINK = 38;
/** Where the bursts go off, as fractions of the view's height from its top. */
const APEX_FROM = 0.1;
const APEX_TO = 0.32;
/** Duds fall back this long into the burst. */
const DUD_MS = 160;

/** A show's colours: each rocket takes the next of them. */
export type FireworkPalette = readonly string[];

export const FIREWORK_PALETTES: readonly FireworkPalette[] = [
  // Red and gold.
  ['#F87171', '#FBBF24', '#FDE68A'],
  // Cool blues and violets.
  ['#60A5FA', '#A78BFA', '#F0ABFC'],
  // Lime and mint.
  ['#34D399', '#A3E635', '#FEF08A'],
  // Pinks.
  ['#F472B6', '#FB7185', '#FECDD3'],
  // Rainbow.
  ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7'],
];

interface Options {
  /** The colours to pick from for each show; the first until the first pick. */
  palettes?: readonly FireworkPalette[];
}

/**
 * Fireworks (烟花): the icons go up in a handful of rockets, each gathered from one part of
 * the pile, and burst in the sky, flying apart with the sparks and fading out; the duds fall
 * back onto the pile.
 */
export class Fireworks implements Remover {
  readonly name = 'fireworks';
  private readonly palettes: readonly FireworkPalette[];

  constructor({ palettes = FIREWORK_PALETTES }: Options = {}) {
    this.palettes = palettes;
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Show(board, now, rng, pick(this.palettes, rng));
  }
}

/** One rocket: its icons, where it goes up from and bursts, and when. */
interface Rocket {
  icons: number[];
  colour: string;
  /** The shell's size, as a scale of one icon. */
  shell: number;
  footX: number;
  footY: number;
  apexX: number;
  apexY: number;
  /** When it starts gathering, in ms after the show's start. */
  at: number;
  /** Each spark's direction and how far it goes, as a share of `BURST_R`. */
  sparks: { dx: number; dy: number; reach: number }[];
  /** Each icon's direction out of the burst and how far it goes. */
  flight: { dx: number; dy: number; reach: number }[];
  taken: boolean;
  /** Where its icons were taken from. */
  fromX: number[];
  fromY: number[];
}

/** One show. */
class Show implements Removal {
  private readonly t0: number;
  private readonly rockets: Rocket[];
  private readonly done: number;
  /** The icons that are duds, and which have fallen back or burnt out. */
  private readonly duds = new Set<number>();
  private readonly finished = new Set<number>();

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    palette: FireworkPalette,
  ) {
    const { icons, world } = board;
    const n = icons.length;
    this.t0 = now;
    // Rockets from left to right, each taking the icons in its stretch of the pile.
    const count = Math.max(1, Math.min(n, MAX_ROCKETS, Math.round(Math.sqrt(n) * 1.5)));
    const byX = Array.from({ length: n }, (_, i) => i).sort((a, b) => icons[a]!.x - icons[b]!.x);
    const span = Math.min(LAUNCH_MAX_MS, LAUNCH_EACH_MS * (count - 1));
    // They go up in a shuffled order, so the show isn't a sweep across.
    const order = Array.from({ length: count }, (_, r) => r);
    for (let r = count - 1; r > 0; r--) {
      const j = Math.floor(rng() * (r + 1));
      [order[r], order[j]] = [order[j]!, order[r]!];
    }
    this.rockets = order.map((slot, r) => {
      const group = byX.slice(Math.floor((r * n) / count), Math.floor(((r + 1) * n) / count));
      let sumX = 0;
      let top = Infinity;
      for (const i of group) {
        sumX += icons[i]!.x;
        top = Math.min(top, icons[i]!.y);
      }
      const footX = group.length > 0 ? sumX / group.length : world.width / 2;
      // Its icons' area together, so the shell reads as all of them in one.
      const shell = Math.max(1, Math.min(SHELL_MAX, Math.sqrt(group.length)));
      const ray = () => {
        const a = rng() * Math.PI * 2;
        return { dx: Math.cos(a), dy: Math.sin(a), reach: 0.55 + 0.45 * rng() };
      };
      return {
        icons: group,
        colour: palette[r % palette.length]!,
        shell,
        footX,
        // The shell sits on the pile, rather than sunk into it.
        footY: (Number.isFinite(top) ? top : world.height) - (shell - 1) * board.iconRadius,
        apexX: footX + (rng() - 0.5) * 70,
        apexY:
          board.camera.view.top +
          board.camera.view.height * (APEX_FROM + (APEX_TO - APEX_FROM) * rng()),
        at: count > 1 ? (span * slot) / (count - 1) + rng() * 120 : 0,
        sparks: Array.from({ length: SPARKS }, ray),
        flight: group.map(ray),
        taken: false,
        fromX: [],
        fromY: [],
      };
    });
    this.done = Math.max(...this.rockets.map((r) => r.at)) + GATHER_MS + CLIMB_MS + BURST_MS;
    // The duds, spread over the rockets.
    for (let k = 0; k < board.dropCount; k++)
      this.duds.add(byX[Math.floor((k * n) / board.dropCount)]!);
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const t = now - this.t0;
    for (const rocket of this.rockets) {
      const u = t - rocket.at;
      if (u < 0) continue;
      if (!rocket.taken) this.launch(rocket);
      if (u < GATHER_MS) this.drawGather(rocket, u / GATHER_MS);
      else if (u < GATHER_MS + CLIMB_MS) this.drawClimb(ctx, rocket, (u - GATHER_MS) / CLIMB_MS);
      else if (u < GATHER_MS + CLIMB_MS + BURST_MS) {
        this.drawBurst(ctx, rocket, (u - GATHER_MS - CLIMB_MS) / BURST_MS);
      } else this.burnOut(rocket);
    }
  }

  /** The rocket's icons leave the pile. */
  private launch(rocket: Rocket): void {
    rocket.taken = true;
    for (const i of rocket.icons) {
      const at = this.board.take(i) ?? this.board.icons[i]!;
      rocket.fromX.push(at.x);
      rocket.fromY.push(at.y);
    }
  }

  /** The icons drawing together at the rocket's foot, into a shell that grows as they come. */
  private drawGather(rocket: Rocket, u: number): void {
    const e = easeOut(u);
    rocket.icons.forEach((_, k) => {
      const x = rocket.fromX[k]! + (rocket.footX - rocket.fromX[k]!) * e;
      const y = rocket.fromY[k]! + (rocket.footY - rocket.fromY[k]!) * e;
      this.board.stamp(x, y, 1 - 0.3 * e);
    });
    this.board.stamp(rocket.footX, rocket.footY, rocket.shell * e);
  }

  /** Where the rocket is `u` of the way up its climb. */
  private climbAt(rocket: Rocket, u: number): { x: number; y: number } {
    const e = easeOut(u);
    return {
      x: rocket.footX + (rocket.apexX - rocket.footX) * e * e,
      y: rocket.footY + (rocket.apexY - rocket.footY) * e,
    };
  }

  /** The shell climbing, with a trail of sparks behind it. */
  private drawClimb(ctx: CanvasRenderingContext2D, rocket: Rocket, u: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 1; k <= 8; k++) {
      const back = this.climbAt(rocket, Math.max(0, u - k * 0.035));
      ctx.fillStyle = `rgba(254, 240, 138, ${(0.55 * (1 - k / 9)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(back.x + Math.sin(k * 7 + u * 40) * 1.5, back.y, 2.2 - k * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const at = this.climbAt(rocket, u);
    const glowR = 14 * rocket.shell;
    const glow = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, glowR);
    glow.addColorStop(0, rocket.colour);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(at.x, at.y, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.board.stamp(at.x, at.y, rocket.shell);
  }

  /** The burst, `u` of the way through: a flash, the sparks, and the icons flying apart. */
  private drawBurst(ctx: CanvasRenderingContext2D, rocket: Rocket, u: number): void {
    const { apexX: x, apexY: y } = rocket;
    const spread = easeOut(u) * BURST_R;
    const sink = SINK * u * u;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (u < 0.2) {
      const flash = ctx.createRadialGradient(x, y, 0, x, y, 34);
      flash.addColorStop(0, `rgba(255, 255, 255, ${(0.8 * (1 - u / 0.2)).toFixed(3)})`);
      flash.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = rocket.colour;
    for (const s of rocket.sparks) {
      ctx.beginPath();
      ctx.arc(x + s.dx * s.reach * spread, y + s.dy * s.reach * spread + sink, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    rocket.icons.forEach((i, k) => {
      if (this.finished.has(i)) return;
      const f = rocket.flight[k]!;
      const ix = x + f.dx * f.reach * spread * 0.8;
      const iy = y + f.dy * f.reach * spread * 0.8 + sink;
      if (this.duds.has(i) && u * BURST_MS >= DUD_MS) {
        this.finished.add(i);
        this.board.drop(i, ix, iy);
        return;
      }
      this.board.stamp(ix, iy, 0.7 * (1 - u));
    });
  }

  /** The burst is over: whatever of it is left is gone. */
  private burnOut(rocket: Rocket): void {
    for (const i of rocket.icons) {
      if (this.finished.has(i)) continue;
      this.finished.add(i);
      if (this.duds.has(i)) this.board.drop(i, rocket.apexX, rocket.apexY);
      else this.board.destroy(i);
    }
  }
}
