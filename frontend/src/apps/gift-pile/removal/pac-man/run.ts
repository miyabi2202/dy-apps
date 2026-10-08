import type { Board, Gfx, Point, Removal } from '../board';
import type { PacManPalette } from './pac-man';
import { PileTop } from '../kit/pile-top';
import { drawGhost, drawPacMan, GHOST_R, PAC_R } from './sprites';
import { Clock } from '../kit/clock';
import { pacManPortrait } from '../kit/portraits';
import { Trail, Wake } from '../kit/trail';
import { Frames } from '../kit/clock';
import { sparkBurst } from '../kit/fx';
import { Emitter } from '../kit/particles';

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
/** The view is kept moved to have him this far from its top and bottom, at least. */
const CAMERA_MARGIN = PAC_R * 3;
/** The cut-in comes this long after he sets off, once he is on the canvas. */
const CUT_IN_MS = 300;
/** The ghost chases this far behind him along his path. */
const GHOST_GAP = 78;
/** Caught: the ghost closes in over this long, then he shrivels away over this long, and it's over this long after. */
const CATCH_MS = 380;
const DIE_MS = 900;
const AFTER_MS = 450;
/** The icons he still holds burst out of him this fast, in px per second, and this far either side of straight up. */
const BURST_SPEED = 260;
const BURST_SPREAD = 2.2;

/** Every this many icons eaten is a power pellet: the ghost turns blue for this long. */
const POWER_EVERY = 20;
const SCARED_MS = 600;
/** Dots of pellet lie ahead of him this far apart, this far out. */
const PELLET_GAP = 14;
const PELLET_REACH = 120;
/** A pop of light where an icon is eaten lasts this long. */
const POP_MS = 80;

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
  /** Whether the cut-in has been asked for. */
  private introduced = false;
  private readonly frames = new Frames();
  private readonly crumbs: Emitter;
  private readonly sparks: Emitter;
  private readonly streak = new Wake(260);
  private readonly ghostWake = new Wake(500);
  /** Where icons were eaten, and when, for the pops of light; when the ghost last turned blue. */
  private readonly pops: { x: number; y: number; at: number }[] = [];
  private scaredAt = -Infinity;
  private powerFlash = -Infinity;
  private popped = false;

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
    this.crumbs = new Emitter(
      { capacity: 160, colorFrom: '#fb923c', gravity: 400, drag: 1, alphaOverLife: (u) => 1 - u },
      this.rng,
    );
    this.sparks = new Emitter(
      {
        capacity: 120,
        shape: 'spark',
        colorFrom: '#fef9c3',
        colorTo: palette.pac,
        drag: 1.5,
      },
      this.rng,
    );
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

  draw(gfx: Gfx, now: number): void {
    const target = now - this.t0;
    // Move in small steps, so he eats everything in his way however far apart the frames are.
    this.clock.advance(target, (dt) => {
      if (this.caughtAt === null) this.move(dt);
    });
    const { t } = this.clock;
    const { palette } = this;
    const me = this.at();
    // Once he is well into the canvas, the cut-in.
    if (!this.introduced && t >= CUT_IN_MS) {
      this.introduced = true;
      this.board.fx.cutIn({
        name: 'pac-man',
        color: '#facc15',
        portrait: pacManPortrait(palette.pac),
      });
    }
    // Down through the rows, the view follows him, so he never goes out of sight.
    this.board.camera.keepInView(me.y, CAMERA_MARGIN);

    const dt = this.frames.dt(t);
    if (t - this.powerFlash < 120) gfx.flash('#fde047', 0.12 * (1 - (t - this.powerFlash) / 120));
    const scared = t - this.scaredAt < SCARED_MS;
    const ghostColour = scared
      ? Math.floor(t / 90) % 2 === 0 || t - this.scaredAt < 400
        ? '#3b82f6'
        : '#e2e8f0'
      : palette.ghost;
    this.drawPellets(gfx, me);
    this.drawPops(gfx, t);
    this.crumbs.step(dt);
    this.crumbs.draw(gfx);

    if (this.caughtAt === null) {
      const ghost = this.trail.behind(GHOST_GAP);
      const g = { x: ghost.x, y: ghost.y + Math.sin(t / 180) * 2 };
      // The ghost leaves ectoplasm behind it; he, when leaving, a yellow streak.
      this.ghostWake.add(g.x, g.y, t);
      gfx.ribbon(this.ghostWake.points(), (u) => 2 * GHOST_R * (1 - u), ghostColour, {
        alphaFrom: 0.25,
        alphaTo: 0,
        blend: 'add',
      });
      drawGhost(gfx, g, me, ghostColour, t, scared);
      if (this.leaving) {
        this.streak.add(me.x, me.y, t);
        gfx.ribbon(this.streak.points(), (u) => PAC_R * 1.4 * (1 - u), palette.pac, {
          alphaFrom: 0.5,
          alphaTo: 0,
          blend: 'add',
        });
        gfx.speedLines(me.x, me.y, { alpha: 0.25 });
      }
      drawPacMan(gfx, me, this.facing(), palette.pac, t);
      return;
    }
    // The ghost closes in, then he shrivels; what is in him bursts out as he goes.
    const since = t - this.caughtAt;
    const gap = GHOST_GAP + (PAC_R - GHOST_GAP) * Math.min(1, since / CATCH_MS);
    if (since >= CATCH_MS && !this.burst) this.burstOut(me);
    if (since < CATCH_MS) gfx.speedLines(me.x, me.y, { alpha: 0.4, inner: 0.35, seed: 3 });
    else {
      const u = Math.min(1, (since - CATCH_MS) / DIE_MS);
      gfx.aberration(0.55 * (1 - u));
      // One ring out from where he popped, as the last of him goes.
      if (u > 0.85) {
        if (!this.popped) {
          this.popped = true;
          sparkBurst(this.sparks, me.x, me.y, '#fef9c3', 12, { speed: 300, life: 600, size: 8 });
        }
        const v = (u - 0.85) / 0.15;
        gfx.shockwave(me.x, me.y, 80 * v, 24, 10 * (1 - v));
      }
    }
    drawGhost(gfx, this.trail.behind(gap), me, ghostColour, t);
    const dying = since < CATCH_MS ? 0 : Math.min(1, (since - CATCH_MS) / DIE_MS);
    drawPacMan(gfx, me, this.facing(), palette.pac, t, dying);
    this.sparks.step(dt);
    this.sparks.draw(gfx);
  }

  /** Dots along his row ahead of him, fading with distance. */
  private drawPellets(gfx: Gfx, me: Point): void {
    if (this.caughtAt !== null) return;
    const dir = this.heading;
    for (let d = PELLET_GAP; d <= PELLET_REACH; d += PELLET_GAP) {
      const alpha = 0.6 - d / 200;
      const x = dir === 0 ? me.x : me.x + dir * d;
      const y = dir === 0 ? me.y + d : me.y;
      gfx.circle(x, y, 2, '#fef3c7', { alpha });
    }
  }

  /** The bright dots where icons have just been eaten. */
  private drawPops(gfx: Gfx, t: number): void {
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const pop = this.pops[k]!;
      const age = t - pop.at;
      if (age > POP_MS) this.pops.splice(k, 1);
      else gfx.glow(pop.x, pop.y, 8, '#ffffff', { intensity: 1.6 * (1 - age / POP_MS) });
    }
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
    this.enjoy(i);
    if (this.eatenCount > board.icons.length - board.dropCount) {
      board.take(i);
      this.belly.push(i);
    } else {
      board.destroy(i);
    }
  }

  /** The sparkle of eating icon `i`: a pop of light, crumbs flying back, and a power pellet now and then. */
  private enjoy(i: number): void {
    const { t } = this.clock;
    const p = this.board.where(i) ?? this.board.icons[i]!;
    this.pops.push({ x: p.x, y: p.y, at: t });
    const me = this.at();
    const back = this.heading === 0 ? { x: 0, y: -1 } : { x: -this.heading, y: 0 };
    this.crumbs.burst(3, () => ({
      x: me.x,
      y: me.y,
      vx: back.x * (70 + 70 * this.rng()) + (this.rng() - 0.5) * 80,
      vy: back.y * (70 + 70 * this.rng()) - 40 * this.rng(),
      life: 450,
      size: 4,
    }));
    if (this.eatenCount % POWER_EVERY === 0) {
      this.scaredAt = t;
      this.powerFlash = t;
    }
  }

  /** The icons in his belly burst out of him, up and to either side. */
  private burstOut(me: Point): void {
    this.burst = true;
    this.board.fx.hitStop(100);
    this.board.fx.shake(4, 250);
    for (const i of this.belly) {
      const a = -Math.PI / 2 + (this.rng() - 0.5) * BURST_SPREAD;
      const speed = BURST_SPEED * (0.6 + 0.4 * this.rng());
      this.board.drop(i, me.x, me.y - PAC_R * 0.3, Math.cos(a) * speed, Math.sin(a) * speed);
    }
  }
}
