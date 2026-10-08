import {
  type Board,
  type Gfx,
  pick,
  type Removal,
  type Remover,
  type ScoopShape,
  type SpriteSource,
} from '../board';
import { smooth } from '../kit/easing';
import { clumpOf, clumpSomewhere } from '../kit/clump';
import { blackHolePortrait } from './portrait';
import { BLACK_HOLE_SHADERS, drawBlackHole, drawBlackHolePop } from './shader';
import { Frames } from '../kit/clock';
import { sparkBurst } from '../kit/fx';
import { Emitter } from '../kit/particles';
import { Wake } from '../kit/trail';
import { easeOut } from '../kit/easing';

// Timing in ms, geometry in world pixels.
/** The hole's radius when fully open, how far above the clump's top its middle is, and how near the view's top it can be at most. */
const HOLE_R = 24;
const ABOVE = 90;
const MIN_Y = 60;
/** It opens over this long, and collapses over this long before it pops. */
const OPEN_MS = 650;
const COLLAPSE_MS = 420;
const POP_MS = 450;
/** How far the pop's ring and flare reach. */
const POP_R = 230;
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
  /** Compiled when the page opens. */
  readonly shaders = BLACK_HOLE_SHADERS;
  /** Its cut-in portraits, painted ahead of time. */
  readonly sprites: readonly SpriteSource[];
  private readonly palettes: readonly BlackHolePalette[];

  constructor({ palettes = BLACK_HOLE_PALETTES }: Options = {}) {
    this.palettes = palettes;
    this.sprites = palettes.map(({ glow, disk }) => blackHolePortrait(glow, disk));
  }

  /** A clump of the pile somewhere across it. */
  shape(rng: () => number): ScoopShape {
    return clumpSomewhere(rng, AIM_FROM, AIM_TO);
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Swallow(board, now, rng, pick(this.palettes, rng));
  }
}

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
  /** Whether the cut-in has been asked for, and whether the pop has shaken the screen. */
  private introduced = false;
  private popped = false;
  private readonly frames = new Frames();
  private readonly stream: Emitter;
  private readonly sparks: Emitter;
  private readonly rng: () => number;
  /** The tail each icon drags behind it. */
  private readonly tails = new Map<number, Wake>();
  /** Flashes where duds were flung out. */
  private readonly flicks: { x: number; y: number; at: number }[] = [];

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    private readonly palette: BlackHolePalette,
  ) {
    const { icons, world } = board;
    const n = icons.length;
    this.t0 = now;
    this.rng = rng;
    this.stream = new Emitter(
      {
        capacity: 400,
        shape: 'spark',
        colorFrom: palette.disk,
        colorTo: '#ffffff',
        sizeOverLife: (u) => 1 - 0.7 * u,
        alphaOverLife: (u) => Math.sin(Math.PI * Math.min(1, u * 1.2)),
      },
      rng,
    );
    this.sparks = new Emitter(
      {
        capacity: 200,
        shape: 'spark',
        colorFrom: '#ffffff',
        colorTo: palette.rim,
        drag: 1.2,
      },
      rng,
    );
    const { x: cx, top } = clumpOf(icons, world, 50);
    this.cx = cx;
    this.cy = Math.max(board.camera.view.top + MIN_Y, top - ABOVE);
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
    const e = smooth(u);
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

  draw(gfx: Gfx, now: number): void {
    const t = now - this.t0;
    const { board } = this;
    const dt = this.frames.dt(t);
    // How open it is: opening, open, then collapsing.
    if (!this.introduced && t >= OPEN_MS) {
      this.introduced = true;
      board.fx.cutIn({
        name: 'black-hole',
        color: this.palette.glow,
        portrait: blackHolePortrait(this.palette.glow, this.palette.disk),
      });
    }
    const popAt = this.collapse + COLLAPSE_MS;
    if (!this.popped && t >= popAt) {
      this.popped = true;
      board.fx.hitStop(100);
      board.fx.shake(6, 350);
      sparkBurst(this.sparks, this.cx, this.cy, '#ffffff', 120, {
        speed: 420,
        life: 800,
        size: 11,
      });
    }
    const open = t < OPEN_MS ? smooth(t / OPEN_MS) : 1 - smooth((t - this.collapse) / COLLAPSE_MS);
    if (open > 0) this.drawHole(gfx, open, t, dt);
    if (t >= popAt) this.drawPop(gfx, (t - popAt) / POP_MS);

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
        this.tails.delete(i);
        this.flicks.push({ x: p.x, y: p.y, at: t });
        board.drop(i, p.x, p.y, p.vx, p.vy);
        continue;
      }
      if (u >= 1) {
        this.finished[i] = 1;
        this.tails.delete(i);
        continue;
      }
      this.drawInfall(gfx, i, p, u, t);
    }
    // Where duds were flung out: a flick of white.
    for (let k = this.flicks.length - 1; k >= 0; k--) {
      const f = this.flicks[k]!;
      const age = t - f.at;
      if (age > 140) this.flicks.splice(k, 1);
      else gfx.glow(f.x, f.y, 20, '#ffffff', { intensity: 1.4 * (1 - age / 140) });
    }
    for (const e of [this.stream, this.sparks]) {
      e.step(dt);
      e.draw(gfx);
    }
  }

  /** An icon `u` of the way in at `p`: stretched along its path as it is pulled in, with a tail and sparks. */
  private drawInfall(
    gfx: Gfx,
    i: number,
    p: { x: number; y: number; vx: number; vy: number },
    u: number,
    t: number,
  ): void {
    const { palette, board } = this;
    let tail = this.tails.get(i);
    if (!tail) {
      tail = new Wake(250);
      this.tails.set(i, tail);
    }
    tail.add(p.x, p.y, t);
    // Near the horizon its light is redshifted and dims to nothing.
    const sink = smooth((u - 0.45) / 0.55);
    gfx.ribbon(tail.points(), (v) => board.iconRadius * 1.2 * (1 - v), palette.disk, {
      alphaFrom: 0.5 * (1 - sink),
      alphaTo: 0,
      blend: 'add',
    });
    // Stretched along the way it goes (spaghettification), more as it nears.
    const e = smooth(u);
    const scale = 1 - 0.8 * smooth((u - 0.4) / 0.6);
    const shape = {
      rotation: Math.atan2(p.vy, p.vx),
      scaleX: 1 + 2.4 * e * e,
      scaleY: 1 - 0.35 * e,
    };
    gfx.icon(p.x, p.y, scale, { ...shape, alpha: 1 - 0.85 * sink * sink });
    if (sink > 0) {
      gfx.icon(p.x, p.y, scale, {
        ...shape,
        alpha: 0.85 * sink,
        material: { kind: 'solid', color: '#7f1d1d' },
      });
    }
    this.stream.burst(this.rng() < 0.5 && sink < 0.6 ? 1 : 0, () => ({
      x: p.x,
      y: p.y,
      vx: (this.rng() - 0.5) * 50,
      vy: (this.rng() - 0.5) * 50,
      life: 300,
      size: 6,
      color: palette.disk,
    }));
  }

  /** The procedural hole, its lensing, and a stream of sparks swirling in, `open` from 0 to 1. */
  private drawHole(gfx: Gfx, open: number, _t: number, dt: number): void {
    const { cx, cy, palette, rng } = this;
    drawBlackHole(gfx, cx, cy, HOLE_R, open, { glow: palette.glow, disk: palette.disk });
    gfx.lens(cx, cy, HOLE_R * 7, 0.9 * open);
    gfx.aberration(0.3 * open);
    // Sparks circling in: tangent, with a little inward.
    const ring = 4 * HOLE_R * open;
    this.stream.stream(200 * open, dt, () => {
      const a = rng() * Math.PI * 2;
      return {
        x: cx + Math.cos(a) * ring,
        y: cy + Math.sin(a) * ring * 0.45,
        vx: -Math.sin(a) * 160 - Math.cos(a) * 60,
        vy: (Math.cos(a) * 160 - Math.sin(a) * 60) * 0.45,
        life: 1100,
        size: 11,
        rotation: a + Math.PI / 2,
      };
    });
  }

  /** The pop as it goes: a flash, an air ring and the split of colour, `u` from 0 to 1. */
  private drawPop(gfx: Gfx, u: number): void {
    if (u >= 1) return;
    const { cx, cy, palette } = this;
    gfx.flash('#ffffff', 0.5 * (1 - u) ** 2);
    gfx.aberration(1 - u);
    gfx.shockwave(cx, cy, 200 * easeOut(u), 36, 16 * (1 - u));
    drawBlackHolePop(gfx, cx, cy, POP_R, u, palette.rim);
  }
}
