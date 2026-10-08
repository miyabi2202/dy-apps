import { type Board, pick, type Point, type Removal, type Remover } from '../board';

// Timing in ms, geometry in world pixels.
/** Pac-Man's radius, always the same, and how wide his mouth opens at most, as a half angle. */
const R = 15;
const MOUTH_MAX = 0.75;
/** How many times a second his mouth goes wakka. */
const CHOMPS_PER_S = 7;
/**
 * How fast he goes, in px per ms, and how far outside the canvas he starts; with many rows to
 * eat he goes faster, so that eating them all takes no longer than `MAX_RUN_MS`.
 */
const SPEED = 0.14;
const MAX_RUN_MS = 7000;
const ENTER = 40;
/** He eats an icon whose middle is up to this far ahead of his, and this far either side of his line. */
const BITE_AHEAD = R * 0.7;
const BITE_SIDE = R * 0.85;
/** He moves in steps of this long, however far apart the frames are. */
const STEP_MS = 16;
/** The ghost chases this far behind him along his path, and is this wide either side of its middle. */
const GHOST_GAP = 52;
const GHOST_R = 13;
/** Caught: the ghost closes in over this long, then he shrivels away over this long, and it's over this long after. */
const CATCH_MS = 380;
const DIE_MS = 900;
const AFTER_MS = 450;
/** The icons he still holds burst out of him this fast, in px per second. */
const BURST_SPEED = 260;
/** The pile's top is sampled this often across, and smoothed over this many samples either side. */
const SAMPLE = 8;
const SMOOTH = 3;

/** Pac-Man's yellow and the ghost chasing him. */
export interface PacManPalette {
  pac: string;
  ghost: string;
}

export const PAC_MAN_PALETTES: readonly PacManPalette[] = [
  // Blinky, Pinky, Inky and Clyde.
  { pac: '#FACC15', ghost: '#EF4444' },
  { pac: '#FACC15', ghost: '#F9A8D4' },
  { pac: '#FACC15', ghost: '#22D3EE' },
  { pac: '#FACC15', ghost: '#FB923C' },
];

interface Options {
  /** The colours to pick from for each run; the first until the first pick. */
  palettes?: readonly PacManPalette[];
}

/**
 * Pac-Man eats his way through the pile, row by row, with a ghost on his heels. He starts
 * along the top of the pile from the left and eats whatever is in front of him; at the end
 * of a row he goes down one and comes back the other way, until he has eaten all the board's
 * icons. Then, if some are to be dropped back, the ghost catches him and they burst back out
 * of him as he shrivels away; if not, he runs off.
 */
export class PacMan implements Remover {
  readonly name = 'pac-man';
  private readonly palettes: readonly PacManPalette[];

  constructor({ palettes = PAC_MAN_PALETTES }: Options = {}) {
    this.palettes = palettes;
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Run(board, now, rng, pick(this.palettes, rng));
  }
}

/** Which way he is heading: right, left, or down to the next row. */
type Heading = 1 | -1 | 0;

/** One run through the pile. */
class Run implements Removal {
  private readonly t0: number;
  /** The top of the pile across the canvas, every `SAMPLE` px, by the icons' middles. */
  private readonly top: Float32Array;
  /** How far down one row is, how low the lowest icon is, and where he turns at either end. */
  private readonly rowStep: number;
  private readonly lowest: number;
  private readonly leftEnd: number;
  private readonly rightEnd: number;
  /** How fast he goes, in px per ms. */
  private readonly speed: number;
  /** Where he is: along x, which row, how far down to the next (when heading down), and which way. */
  private x = -ENTER;
  private row = 0;
  private down = 0;
  private heading: Heading = 1;
  /** Which way he went along the last row, to turn the other way after going down. */
  private lastAcross: 1 | -1 = 1;
  /** The time he has been moved to, in ms after `t0`. */
  private t = 0;
  /** Where he has been, latest last, for the ghost to follow. */
  private trail: Point[] = [];
  /** Which icons he has eaten, how many, and the ones still in his belly, to burst out. */
  private readonly eaten: Uint8Array;
  private eatenCount = 0;
  private readonly belly: number[] = [];
  /** When the ghost started to catch him, and when he ran out of icons with none to drop. */
  private caughtAt: number | null = null;
  private leaving = false;
  private burst = false;

  constructor(
    private readonly board: Board,
    now: number,
    private readonly rng: () => number,
    private readonly palette: PacManPalette,
  ) {
    const { icons, world, iconRadius } = board;
    this.t0 = now;
    this.top = topOf(icons, world.width, R);
    this.rowStep = iconRadius * 1.8;
    this.lowest = Math.max(...icons.map((p) => p.y), 0);
    this.leftEnd = R;
    this.rightEnd = world.width - R;
    const highest = Math.min(...icons.map((p) => p.y), this.lowest);
    const rows = Math.floor((this.lowest - highest) / this.rowStep) + 1;
    this.speed = Math.max(SPEED, (rows * (world.width + ENTER)) / MAX_RUN_MS);
    this.eaten = new Uint8Array(icons.length);
    this.trail.push(this.at());
  }

  /** The height of the line he runs along at x on row `row`, following the top of the pile. */
  private lineAt(x: number, row: number): number {
    const { top } = this;
    const k = Math.min(top.length - 1, Math.max(0, x / SAMPLE));
    const k0 = Math.floor(k);
    const k1 = Math.min(top.length - 1, k0 + 1);
    return top[k0]! + (top[k1]! - top[k0]!) * (k - k0) + row * this.rowStep;
  }

  /** Where he is now. */
  private at(): Point {
    return { x: this.x, y: this.lineAt(this.x, this.row) + this.down };
  }

  isOver(now: number): boolean {
    const t = now - this.t0;
    if (this.caughtAt !== null) return t >= this.caughtAt + CATCH_MS + DIE_MS + AFTER_MS;
    if (!this.leaving) return false;
    const { width } = this.board.world;
    const ghost = this.ghostAt(GHOST_GAP);
    return ghost.x < -ENTER - GHOST_R || ghost.x > width + ENTER + GHOST_R;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const target = now - this.t0;
    // Move in small steps, so he eats everything in his way however far apart the frames are.
    while (this.t < target) {
      const dt = Math.min(STEP_MS, target - this.t);
      this.t += dt;
      if (this.caughtAt === null) this.move(dt);
    }
    const t = this.t;
    const me = this.at();

    if (this.caughtAt !== null) {
      const since = t - this.caughtAt;
      // The ghost closes in, then he shrivels; the icons in him burst out as he goes.
      const gap = GHOST_GAP + (R - GHOST_GAP) * Math.min(1, since / CATCH_MS);
      if (since >= CATCH_MS && !this.burst) this.burstOut(me);
      const ghost = this.ghostAt(gap);
      this.drawGhost(ctx, ghost.x, ghost.y, t);
      if (since < CATCH_MS) this.drawPacMan(ctx, me, t, 0);
      else this.drawPacMan(ctx, me, t, Math.min(1, (since - CATCH_MS) / DIE_MS));
      return;
    }
    const ghost = this.ghostAt(GHOST_GAP);
    this.drawGhost(ctx, ghost.x, ghost.y + Math.sin(t / 180) * 2, t);
    this.drawPacMan(ctx, me, t, 0);
  }

  /** Move him on by `dt` ms, eating what is in front of him, and turning or going down at the ends of rows. */
  private move(dt: number): void {
    const step = this.speed * dt;
    if (this.heading === 0) {
      this.down += step;
      if (this.down >= this.rowStep) {
        this.down = 0;
        this.row++;
        this.heading = this.lastAcross === 1 ? -1 : 1;
      }
    } else {
      this.x += this.heading * step;
      const atEnd = this.heading === 1 ? this.x >= this.rightEnd : this.x <= this.leftEnd;
      if (atEnd && !this.leaving) {
        this.x = this.heading === 1 ? this.rightEnd : this.leftEnd;
        this.lastAcross = this.heading;
        this.heading = 0;
      }
    }
    this.trail.push(this.at());
    if (this.trail.length > 400) this.trail.splice(0, 100);
    if (!this.leaving) this.eat();
  }

  /** Eat every icon in front of him; once they are all eaten, he is caught or runs off. */
  private eat(): void {
    const { board } = this;
    const me = this.at();
    const n = board.icons.length;
    const below = me.y > this.lowest + this.rowStep;
    for (let i = 0; i < n; i++) {
      if (this.eaten[i]) continue;
      const p = board.where(i) ?? board.icons[i]!;
      const ahead = this.heading === 0 ? p.y - me.y : (p.x - me.x) * this.heading;
      const side = this.heading === 0 ? Math.abs(p.x - me.x) : Math.abs(p.y - me.y);
      // Gone past the bottom of the pile with some left (they moved): he eats the rest.
      if (below || (ahead >= -R * 0.3 && ahead <= BITE_AHEAD && side <= BITE_SIDE)) this.swallow(i);
    }
    if (this.eatenCount < n) return;
    if (board.dropCount > 0) this.caughtAt = this.t;
    else {
      // Nothing to drop: off he goes the way he is facing, or right if he was going down.
      this.leaving = true;
      if (this.heading === 0) this.heading = this.lastAcross === 1 ? -1 : 1;
    }
  }

  /** Icon `i` is eaten: gone at once, unless it is one of the last, which stay in his belly to drop. */
  private swallow(i: number): void {
    const { board } = this;
    this.eaten[i] = 1;
    this.eatenCount++;
    if (this.eatenCount > board.icons.length - board.dropCount) {
      board.take(i);
      this.belly.push(i);
    } else {
      board.destroy(i);
    }
  }

  /** The icons in his belly burst out of him, up and to either side. */
  private burstOut(me: Point): void {
    this.burst = true;
    for (const i of this.belly) {
      const a = -Math.PI / 2 + (this.rng() - 0.5) * 2.2;
      const speed = BURST_SPEED * (0.6 + 0.4 * this.rng());
      this.board.drop(i, me.x, me.y - R * 0.3, Math.cos(a) * speed, Math.sin(a) * speed);
    }
  }

  /** The ghost, `gap` behind him along where he has been. */
  private ghostAt(gap: number): Point {
    const { trail } = this;
    let left = gap;
    for (let k = trail.length - 1; k > 0; k--) {
      const a = trail[k]!;
      const b = trail[k - 1]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= left) {
        const f = left / d;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
      left -= d;
    }
    const first = trail[0]!;
    return { x: first.x - left, y: first.y };
  }

  /** Pac-Man at `me`, facing the way he is heading, chomping; `dying` from 0 to 1 shrivels him away. */
  private drawPacMan(ctx: CanvasRenderingContext2D, me: Point, t: number, dying: number): void {
    const facing = this.heading === 0 ? Math.PI / 2 : this.heading === 1 ? 0 : Math.PI;
    const chomp = MOUTH_MAX * Math.abs(Math.sin((t / 1000) * Math.PI * CHOMPS_PER_S)) + 0.04;
    // Dying, his mouth opens all the way round until there is nothing left of him.
    const mouth = dying > 0 ? 0.3 + (Math.PI - 0.3) * dying : chomp;
    ctx.save();
    ctx.translate(me.x, me.y);
    if (dying >= 1) {
      // A little pop of lines where he was.
      ctx.restore();
      return;
    }
    // Dying, he turns to face up, as in the game.
    ctx.rotate(dying > 0 ? -Math.PI / 2 : facing);
    ctx.fillStyle = this.palette.pac;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    if (dying === 0) {
      // The eye, above his mouth whichever way he faces.
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(2, this.heading === -1 ? R * 0.5 : -R * 0.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (dying > 0.85) this.drawPop(ctx, me, (dying - 0.85) / 0.15);
  }

  /** The spark of lines as the last of him goes. */
  private drawPop(ctx: CanvasRenderingContext2D, me: Point, u: number): void {
    ctx.save();
    ctx.strokeStyle = this.palette.pac;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 1 - u * 0.5;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const r0 = 4 + 6 * u;
      const r1 = r0 + 5;
      ctx.moveTo(me.x + Math.cos(a) * r0, me.y + Math.sin(a) * r0);
      ctx.lineTo(me.x + Math.cos(a) * r1, me.y + Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** A ghost centred at (x, y), its skirt rippling, its eyes on Pac-Man. */
  private drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const r = GHOST_R;
    const hem = y + r * 0.95;
    const scallops = 4;
    const ripple = Math.sin(t / 90) * 2;
    const me = this.at();
    const look = Math.atan2(me.y - y, me.x - x);
    ctx.save();
    ctx.fillStyle = this.palette.ghost;
    ctx.beginPath();
    ctx.arc(x, y - 2, r, Math.PI, 0);
    ctx.lineTo(x + r, hem);
    // The wavy hem, right to left.
    for (let k = 0; k < scallops; k++) {
      const x0 = x + r - (2 * r * k) / scallops;
      const x1 = x + r - (2 * r * (k + 1)) / scallops;
      ctx.quadraticCurveTo((x0 + x1) / 2, hem - 5 + (k % 2 === 0 ? ripple : -ripple), x1, hem);
    }
    ctx.closePath();
    ctx.fill();
    for (const ex of [-5, 5]) {
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.ellipse(x + ex, y - 3, 3.4, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1D4ED8';
      ctx.beginPath();
      ctx.arc(x + ex + Math.cos(look) * 1.6, y - 3 + Math.sin(look) * 1.8, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * The top of the pile across a canvas `width` wide, every `SAMPLE` px: the highest of the
 * icons within `reach` of each sample, carried across gaps, smoothed.
 */
function topOf(icons: readonly Point[], width: number, reach: number): Float32Array {
  const n = Math.ceil(width / SAMPLE) + 1;
  const raw = new Float32Array(n).fill(NaN);
  for (const { x, y } of icons) {
    const from = Math.max(0, Math.floor((x - reach) / SAMPLE));
    const to = Math.min(n - 1, Math.ceil((x + reach) / SAMPLE));
    for (let k = from; k <= to; k++) raw[k] = Number.isNaN(raw[k]!) ? y : Math.min(raw[k]!, y);
  }
  // Where there are none, keep to the height of the last that has some, or else the next.
  let last = NaN;
  for (let k = 0; k < n; k++) {
    if (Number.isNaN(raw[k]!)) raw[k] = last;
    else last = raw[k]!;
  }
  let next = icons[0]?.y ?? 0;
  for (let k = n - 1; k >= 0; k--) {
    if (Number.isNaN(raw[k]!)) raw[k] = next;
    else next = raw[k]!;
  }
  return raw.map((_, k) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, k - SMOOTH); j <= Math.min(n - 1, k + SMOOTH); j++) {
      s += raw[j]!;
      c++;
    }
    return s / c;
  });
}
