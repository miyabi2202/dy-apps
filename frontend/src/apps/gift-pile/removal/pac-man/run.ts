import type { Board, Point, Removal } from '../board';
import type { PacManPalette } from './pac-man';
import { PileTop } from './pile-top';
import { drawGhost, drawPacMan, GHOST_R } from './sprites';
import { Trail } from './trail';

// Timing in ms, geometry in world pixels.
/** How fast he goes, in px per ms, always, and how far outside the canvas he starts. */
const SPEED = 0.28;
const ENTER = 40;
/**
 * He starts this big, and grows as he eats: his area takes in this share of each icon's, so
 * his radius goes up with the square root of how many he has eaten, until it is this share of
 * the canvas's smaller side. He swells towards his new size over about this long.
 */
const START_R = 15;
const GROWTH = 0.3;
const MAX_R_SHARE = 0.3;
const SWELL_MS = 150;
/** He eats an icon whose middle is up to this far ahead of his, and this far either side of his line, in his radii. */
const BITE_AHEAD = 0.7;
const BITE_BEHIND = 0.3;
const BITE_SIDE = 0.85;
/** Each row goes this share of his bite's height deeper than the last, so no icon slips between. */
const ROW_OVERLAP = 0.9;
/** He moves in steps of this long, however far apart the frames are. */
const STEP_MS = 16;
/** The ghost chases this far behind him along his path, past his edge and its own. */
const GHOST_SPACE = 26;
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
 * One run through the pile. Pac-Man starts small along the top of the pile from the left and
 * eats whatever is in front of him, growing as he goes, so he eats more and more with each
 * row; at the end of a row he goes down below what he has eaten and comes back the other way,
 * until he has eaten all the board's icons. Every one he eats is gone at once, except the last
 * `dropCount`, which stay in his belly. Then, if he holds some, the ghost catches him and they
 * burst out of him as he shrivels away; if not, he runs off.
 */
export class Run implements Removal {
  private readonly t0: number;
  private readonly top: PileTop;
  /** An icon's radius, how low the lowest icon is, and the biggest he gets. */
  private readonly iconR: number;
  private readonly lowest: number;
  private readonly maxR: number;
  /** His radius now. */
  private r = START_R;
  /**
   * Where he is: along x; how far below the top of the pile the rows he has eaten reach, and
   * how far down he has gone towards the next (when heading down); and which way he heads.
   */
  private x = -ENTER;
  private cleared = 0;
  private down = 0;
  private downTo = 0;
  private heading: Heading = 1;
  /** Which way he went along the last row, to turn the other way after going down. */
  private lastAcross: 1 | -1 = 1;
  /** The time he has been moved to, in ms after `t0`. */
  private t = 0;
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
    const { icons, world, iconRadius } = board;
    this.t0 = now;
    this.iconR = iconRadius;
    this.top = new PileTop(icons, world.width, START_R);
    this.lowest = Math.max(0, ...icons.map((p) => p.y));
    this.maxR = Math.max(START_R, MAX_R_SHARE * Math.min(world.width, world.height));
    this.eaten = new Uint8Array(icons.length);
    this.trail = new Trail(this.at());
  }

  /**
   * Where he is now: on his row, his bite's top edge at the top of what is left of the pile,
   * so however big he is he eats from the top down.
   */
  private at(): Point {
    const bite = BITE_SIDE * this.r;
    return {
      x: this.x,
      y: this.top.at(this.x) - this.iconR + this.cleared + this.down + bite,
    };
  }

  /** The way he faces, as an angle. */
  private facing(): number {
    return this.heading === 0 ? Math.PI / 2 : this.heading === 1 ? 0 : Math.PI;
  }

  /** How far behind him the ghost chases. */
  private ghostGap(): number {
    return this.r + GHOST_R + GHOST_SPACE;
  }

  isOver(now: number): boolean {
    const t = now - this.t0;
    if (this.caughtAt !== null) return t >= this.caughtAt + CATCH_MS + DIE_MS + AFTER_MS;
    if (!this.leaving) return false;
    const { width } = this.board.world;
    const ghost = this.trail.behind(this.ghostGap());
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
    const { t, palette, r } = this;
    const me = this.at();

    if (this.caughtAt === null) {
      const ghost = this.trail.behind(this.ghostGap());
      drawGhost(ctx, { x: ghost.x, y: ghost.y + Math.sin(t / 180) * 2 }, me, palette.ghost, t);
      drawPacMan(ctx, me, r, this.facing(), palette.pac, t);
      return;
    }
    // The ghost closes in, then he shrivels; what is in him bursts out as he goes.
    const since = t - this.caughtAt;
    const gap = this.ghostGap() + (r - this.ghostGap()) * Math.min(1, since / CATCH_MS);
    if (since >= CATCH_MS && !this.burst) this.burstOut(me);
    drawGhost(ctx, this.trail.behind(gap), me, palette.ghost, t);
    const dying = since < CATCH_MS ? 0 : Math.min(1, (since - CATCH_MS) / DIE_MS);
    drawPacMan(ctx, me, r, this.facing(), palette.pac, t, dying);
  }

  /**
   * Move him on by `dt` ms, swelling towards his size for what he has eaten, eating what is
   * in front of him, and turning or going down at the ends of rows.
   */
  private move(dt: number): void {
    const grown = Math.min(
      this.maxR,
      Math.sqrt(START_R * START_R + GROWTH * this.eatenCount * this.iconR * this.iconR),
    );
    this.r += (grown - this.r) * Math.min(1, dt / SWELL_MS);
    const step = SPEED * dt;
    const { width } = this.board.world;
    if (this.heading === 0) {
      this.down = Math.min(this.downTo, this.down + step);
      if (this.down >= this.downTo) {
        this.cleared += this.downTo;
        this.down = 0;
        this.heading = this.lastAcross === 1 ? -1 : 1;
      }
    } else {
      this.x += this.heading * step;
      const atEnd = this.heading === 1 ? this.x >= width - this.r : this.x <= this.r;
      if (atEnd && !this.leaving) {
        this.x = this.heading === 1 ? width - this.r : this.r;
        this.lastAcross = this.heading;
        this.heading = 0;
        // Down below what this row ate, by most of his bite's height as he is now.
        this.downTo = 2 * BITE_SIDE * this.r * ROW_OVERLAP;
      }
    }
    this.trail.add(this.at());
    if (!this.leaving) this.eat();
  }

  /** Eat every icon in front of him; once they are all eaten, he is caught or runs off. */
  private eat(): void {
    const { board, r } = this;
    const me = this.at();
    const n = board.icons.length;
    // Gone past the bottom of the pile with some left (they moved): he eats the rest.
    const below = me.y - BITE_SIDE * r > this.lowest + this.iconR;
    for (let i = 0; i < n; i++) {
      if (this.eaten[i]) continue;
      const p = board.where(i) ?? board.icons[i]!;
      const ahead = this.heading === 0 ? p.y - me.y : (p.x - me.x) * this.heading;
      const side = this.heading === 0 ? Math.abs(p.x - me.x) : Math.abs(p.y - me.y);
      if (
        below ||
        (ahead >= -BITE_BEHIND * r && ahead <= BITE_AHEAD * r && side <= BITE_SIDE * r)
      ) {
        this.swallow(i);
      }
    }
    if (this.eatenCount < n) return;
    if (this.belly.length > 0) this.caughtAt = this.t;
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

  /** The icons in his belly burst out of him, up and to either side, from all over him. */
  private burstOut(me: Point): void {
    this.burst = true;
    for (const i of this.belly) {
      const a = -Math.PI / 2 + (this.rng() - 0.5) * BURST_SPREAD;
      const speed = BURST_SPEED * (0.6 + 0.4 * this.rng());
      const from = this.r * 0.5 * this.rng();
      this.board.drop(
        i,
        me.x + Math.cos(a) * from,
        me.y + Math.sin(a) * from,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
      );
    }
  }
}
