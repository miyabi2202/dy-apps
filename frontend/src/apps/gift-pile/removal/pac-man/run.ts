import type { Board, Point, Removal } from '../board';
import type { PacManPalette } from './pac-man';
import { PileTop } from '../kit/pile-top';
import { drawGhost, drawPacMan, GHOST_R, PAC_R } from './sprites';
import { Trail } from './trail';
import { Clock } from '../kit/clock';

// Timing in ms, geometry in world pixels.
/** How fast he goes, in px per ms, always, and how far outside the canvas he starts. */
const SPEED = 0.28;
const ENTER = 40;
/** He eats an icon whose middle is up to this far ahead of his, and this far either side of his line. */
const BITE_AHEAD = PAC_R * 0.7;
const BITE_BEHIND = PAC_R * 0.3;
const BITE_SIDE = PAC_R * 0.85;
/** One row is this far below the last: a little less than his bite is tall, so no icon slips between. */
const ROW_STEP = BITE_SIDE * 1.8;
/** The ghost chases this far behind him along his path. */
const GHOST_GAP = 78;
/** Caught: the ghost closes in over this long, then he shrivels away over this long, and it's over this long after. */
const CATCH_MS = 380;
const DIE_MS = 900;
const AFTER_MS = 450;
/** The icons he still holds burst out of him this fast, in px per second, and this far either side of straight up. */
const BURST_SPEED = 260;
const BURST_SPREAD = 2.2;

/** Which way he is heading: right, left, or down to the next row. */
type Heading = 1 | -1 | 0;

/**
 * One run through the pile. Pac-Man starts along the top of the pile from the left and eats
 * whatever is in front of him; at the end of a row he goes down one and comes back the other
 * way, until he has eaten all the board's icons. Every one he eats is gone at once, except the
 * last `dropCount`, which stay in his belly. Then, if he holds some, the ghost catches him and
 * they burst out of him as he shrivels away; if not, he runs off.
 */
export class Run implements Removal {
  private readonly t0: number;
  private readonly rows: PileTop;
  /** How far down one row is, how low the lowest icon is, and where he turns at either end. */
  private readonly rowStep: number;
  private readonly lowest: number;
  private readonly leftEnd: number;
  private readonly rightEnd: number;
  /** Where he is: along x, which row, how far down to the next (when heading down), and which way. */
  private x = -ENTER;
  private row = 0;
  private down = 0;
  private heading: Heading = 1;
  /** Which way he went along the last row, to turn the other way after going down. */
  private lastAcross: 1 | -1 = 1;
  /** The time he has been moved to, in ms after `t0`. */
  private readonly clock = new Clock();
  private readonly trail: Trail;
  /** Which icons he has eaten, how many, and the ones still in his belly, to burst out. */
  private readonly eaten: Uint8Array;
  private eatenCount = 0;
  private readonly belly: number[] = [];
  /** When the ghost started to catch him; whether he has run out of icons with none to drop; whether his belly has burst. */
  private caughtAt: number | null = null;
  private leaving = false;
  private burst = false;

  constructor(
    private readonly board: Board,
    now: number,
    private readonly rng: () => number,
    private readonly palette: PacManPalette,
  ) {
    const { icons, world } = board;
    this.t0 = now;
    this.rowStep = ROW_STEP;
    this.rows = new PileTop(icons, world.width, PAC_R, this.rowStep);
    this.lowest = Math.max(0, ...icons.map((p) => p.y));
    this.leftEnd = PAC_R;
    this.rightEnd = world.width - PAC_R;
    this.eaten = new Uint8Array(icons.length);
    this.trail = new Trail(this.at());
  }

  /** Where he is now. */
  private at(): Point {
    return { x: this.x, y: this.rows.rowAt(this.x, this.row) + this.down };
  }

  /** The way he faces, as an angle. */
  private facing(): number {
    return this.heading === 0 ? Math.PI / 2 : this.heading === 1 ? 0 : Math.PI;
  }

  isOver(now: number): boolean {
    const t = now - this.t0;
    if (this.caughtAt !== null) return t >= this.caughtAt + CATCH_MS + DIE_MS + AFTER_MS;
    if (!this.leaving) return false;
    const { width } = this.board.world;
    const ghost = this.trail.behind(GHOST_GAP);
    return ghost.x < -ENTER - GHOST_R || ghost.x > width + ENTER + GHOST_R;
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const target = now - this.t0;
    // Move in small steps, so he eats everything in his way however far apart the frames are.
    this.clock.advance(target, (dt) => {
      if (this.caughtAt === null) this.move(dt);
    });
    const { t } = this.clock;
    const { palette } = this;
    const me = this.at();

    if (this.caughtAt === null) {
      const ghost = this.trail.behind(GHOST_GAP);
      drawGhost(ctx, { x: ghost.x, y: ghost.y + Math.sin(t / 180) * 2 }, me, palette.ghost, t);
      drawPacMan(ctx, me, this.facing(), palette.pac, t);
      return;
    }
    // The ghost closes in, then he shrivels; what is in him bursts out as he goes.
    const since = t - this.caughtAt;
    const gap = GHOST_GAP + (PAC_R - GHOST_GAP) * Math.min(1, since / CATCH_MS);
    if (since >= CATCH_MS && !this.burst) this.burstOut(me);
    drawGhost(ctx, this.trail.behind(gap), me, palette.ghost, t);
    const dying = since < CATCH_MS ? 0 : Math.min(1, (since - CATCH_MS) / DIE_MS);
    drawPacMan(ctx, me, this.facing(), palette.pac, t, dying);
  }

  /** Move him on by `dt` ms, eating what is in front of him, and turning or going down at the ends of rows. */
  private move(dt: number): void {
    const step = SPEED * dt;
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
    this.trail.add(this.at());
    if (!this.leaving) this.eat();
  }

  /** Eat every icon in front of him; once they are all eaten, he is caught or runs off. */
  private eat(): void {
    const { board } = this;
    const me = this.at();
    const n = board.icons.length;
    // Gone past the bottom of the pile with some left (they moved): he eats the rest.
    const below = me.y > this.lowest + this.rowStep;
    for (let i = 0; i < n; i++) {
      if (this.eaten[i]) continue;
      const p = board.where(i) ?? board.icons[i]!;
      const ahead = this.heading === 0 ? p.y - me.y : (p.x - me.x) * this.heading;
      const side = this.heading === 0 ? Math.abs(p.x - me.x) : Math.abs(p.y - me.y);
      if (below || (ahead >= -BITE_BEHIND && ahead <= BITE_AHEAD && side <= BITE_SIDE)) {
        this.swallow(i);
      }
    }
    if (this.eatenCount < n) return;
    if (this.belly.length > 0) this.caughtAt = this.clock.t;
    else {
      // Nothing to drop: off he goes the way he is facing, or back the other way if going down.
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
      const a = -Math.PI / 2 + (this.rng() - 0.5) * BURST_SPREAD;
      const speed = BURST_SPEED * (0.6 + 0.4 * this.rng());
      this.board.drop(i, me.x, me.y - PAC_R * 0.3, Math.cos(a) * speed, Math.sin(a) * speed);
    }
  }
}
