import { type Board, pick, type Removal, type Remover } from '../board';
import { type Course, type Craft, type Pose } from '../kit/craft';
import { Crossing } from '../kit/crossing';
import { Mouth } from '../kit/mouth';

/** Pac-Man's radius, and how wide his mouth opens at most, as a half angle. */
const R = 22;
const MOUTH_MAX = 0.75;
/** How many times a second his mouth goes wakka. */
const CHOMPS_PER_S = 7;
/** The ghost chases this far behind him, and is this wide either side of its middle. */
const GHOST_GAP = 64;
const GHOST_R = 17;

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
  /** The colours to pick from for each crossing; the first until the first pick. */
  palettes?: readonly PacManPalette[];
}

/**
 * Pac-Man chomps across just above the pile, eating the icons like dots (the duds he spits
 * back out), with a ghost hard on his heels.
 */
export class PacMan implements Craft, Remover {
  readonly name = 'pac-man';
  readonly crossMs = 3800;
  /** Icons go into his mouth, a little ahead of his middle. */
  readonly tie = { dx: R * 0.4, dy: 0 };
  readonly intake = new Mouth();
  /** The ghost behind him. */
  readonly trail = GHOST_GAP + GHOST_R;
  private readonly palettes: readonly PacManPalette[];
  private palette: PacManPalette;

  constructor({ palettes = PAC_MAN_PALETTES }: Options = {}) {
    this.palettes = palettes;
    this.palette = palettes[0]!;
  }

  /** Picks this crossing's colours, then sets off. */
  begin(board: Board, now: number, rng: () => number): Removal {
    this.palette = pick(this.palettes, rng);
    return new Crossing(this, board, now, rng);
  }

  minY(): number {
    return R + 10;
  }

  sag(): number {
    return 0;
  }

  /** Straight across, as in the maze. */
  pathAt(course: Course): Pose {
    return { py: course.altitude, tilt: 0 };
  }

  /** Pac-Man facing right, and the ghost behind him. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, _tilt: number, t: number): void {
    this.drawGhost(ctx, x - GHOST_GAP, y + Math.sin(t / 180) * 3, t);
    const mouth = MOUTH_MAX * Math.abs(Math.sin((t / 1000) * Math.PI * CHOMPS_PER_S)) + 0.04;
    ctx.save();
    ctx.fillStyle = this.palette.pac;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, R, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(x + 3, y - R * 0.55, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A ghost centred at (x, y), its skirt rippling, its eyes on Pac-Man ahead. */
  private drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const r = GHOST_R;
    const hem = y + r * 0.95;
    const scallops = 4;
    const ripple = Math.sin(t / 90) * 2;
    ctx.save();
    ctx.fillStyle = this.palette.ghost;
    ctx.beginPath();
    ctx.arc(x, y - 2, r, Math.PI, 0);
    ctx.lineTo(x + r, hem);
    // The wavy hem, right to left.
    for (let k = 0; k < scallops; k++) {
      const x0 = x + r - (2 * r * k) / scallops;
      const x1 = x + r - (2 * r * (k + 1)) / scallops;
      ctx.quadraticCurveTo((x0 + x1) / 2, hem - 6 + (k % 2 === 0 ? ripple : -ripple), x1, hem);
    }
    ctx.closePath();
    ctx.fill();
    for (const ex of [-6, 6]) {
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.ellipse(x + ex, y - 4, 4.2, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1D4ED8';
      ctx.beginPath();
      ctx.arc(x + ex + 2, y - 3.5, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
