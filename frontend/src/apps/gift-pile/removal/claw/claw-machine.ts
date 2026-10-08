import { type Board, type Gfx, pick, type Removal, type Remover, type ScoopShape } from '../board';
import { smooth } from '../kit/easing';
import { clumpOf, clumpSomewhere } from '../kit/clump';
import { clawPortrait } from '../kit/portraits';
import { Frames } from '../kit/clock';
import { confetti, sparkBurst } from '../kit/fx';
import { Emitter } from '../kit/particles';

// Timing in ms, geometry in world pixels.
/** The rail along the top of the view that the carriage runs on, and how long it fades in and out. */
const RAIL_Y = 10;
const FADE_MS = 250;
/** The claw hangs this far below the view's top at rest. */
const REST_Y = 54;
/** The carriage comes in from the right this fast, and carries the prize off to the left. */
const ENTER_MS = 900;
const EXIT_MS = 1100;
/** The claw goes down and up at this many px per ms, but takes at least this long each way. */
const CABLE_SPEED = 0.38;
const CABLE_MIN_MS = 450;
/** How long the prongs take to close, while the icons are gathered in. */
const GRIP_MS = 480;
/** From the claw's hub down to the prongs' tips, open; it goes down until they reach the pile. */
const REACH = 30;
/** The prize hangs this far below the hub, and is packed no wider than this. */
const PRIZE_DROP = 14;
const PRIZE_MAX_R = 30;
/** Where the claw can aim, as fractions of the canvas's width. */
const AIM_FROM = 0.2;
const AIM_TO = 0.8;
/** The confetti pieces are this wide, in px. */
const CONFETTI_SIZE = 16;
/** The confetti goes off this far below the rail, so that it is all in view. */
const CONFETTI_DROP = 40;

/** A claw machine's colours: the carriage and hub, the prongs, and the rail. */
export interface ClawPalette {
  body: string;
  metal: string;
  rail: string;
}

export const CLAW_PALETTES: readonly ClawPalette[] = [
  // Bubblegum pink.
  { body: '#F472B6', metal: '#E2E8F0', rail: '#BE185D' },
  // Mint.
  { body: '#34D399', metal: '#F1F5F9', rail: '#047857' },
  // Arcade gold.
  { body: '#FACC15', metal: '#FEF9C3', rail: '#A16207' },
  // Sky blue.
  { body: '#38BDF8', metal: '#F0F9FF', rail: '#0369A1' },
  // Lavender.
  { body: '#A78BFA', metal: '#EDE9FE', rail: '#6D28D9' },
];

interface Options {
  /** The colours to pick from for each removal; the first until the first pick. */
  palettes?: readonly ClawPalette[];
}

/**
 * A claw machine (娃娃机): a carriage slides along a rail at the top to a clump of the pile,
 * lowers the claw, closes it on the icons and draws them up into a bunch in its grip; a few
 * slip out on the way up, as they do, and it carries off the rest.
 */
export class ClawMachine implements Remover {
  readonly name = 'claw';
  private readonly palettes: readonly ClawPalette[];

  constructor({ palettes = CLAW_PALETTES }: Options = {}) {
    this.palettes = palettes;
  }

  /** A clump of the pile somewhere across it. */
  shape(rng: () => number): ScoopShape {
    return clumpSomewhere(rng, AIM_FROM, AIM_TO);
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Grab(board, now, rng, pick(this.palettes, rng));
  }
}

/** One go of the claw. */
class Grab implements Removal {
  private readonly t0: number;
  /** Where the rail is and the claw rests, at the view's top. */
  private readonly railY: number;
  private readonly restY: number;
  /** Where the clump is, and how low the hub goes to reach it. */
  private readonly targetX: number;
  private readonly gripY: number;
  /** When each phase ends, in ms after `t0`. */
  private readonly entered: number;
  private readonly lowered: number;
  private readonly gripped: number;
  private readonly raised: number;
  private readonly done: number;
  /** Each icon's place in the prize, from its middle, and how small they are drawn to fit. */
  private readonly slotX: Float32Array;
  private readonly slotY: Float32Array;
  private readonly scale: number;
  private readonly prizeR: number;
  /** Where each icon was taken from, and whether it has slipped out. */
  private readonly fromX: Float32Array;
  private readonly fromY: Float32Array;
  private readonly slipped: Uint8Array;
  /** The icons that slip out, and when, in time order. */
  private readonly slips: { i: number; at: number }[] = [];
  private taken = false;
  private won = false;
  private readonly frames = new Frames();
  private readonly sparks: Emitter;
  private readonly discs: Emitter;
  private readonly stars: Emitter;

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    private readonly palette: ClawPalette,
  ) {
    const { icons, world, iconRadius } = board;
    const { view } = board.camera;
    this.sparks = new Emitter(
      {
        capacity: 160,
        shape: 'spark',
        colorFrom: '#ffffff',
        colorTo: palette.body,
        drag: 2,
        gravity: 200,
      },
      rng,
    );
    const party = {
      capacity: 160,
      gravity: 420,
      colorFrom: '#ffffff',
      alphaOverLife: (u: number) => Math.min(1, 2.5 * (1 - u)) * 1.35,
      sizeOverLife: () => 1,
    };
    this.discs = new Emitter({ ...party, shape: 'disc' }, rng);
    this.stars = new Emitter({ ...party, shape: 'star' }, rng);
    this.railY = view.top + RAIL_Y;
    this.restY = view.top + REST_Y;
    const n = icons.length;
    this.t0 = now;
    const { x: targetX, top } = clumpOf(icons, world, 30);
    this.targetX = targetX;
    this.gripY = Math.max(this.restY, top - REACH + iconRadius);
    const cableMs = Math.max(CABLE_MIN_MS, (this.gripY - this.restY) / CABLE_SPEED);
    this.entered = ENTER_MS;
    this.lowered = this.entered + cableMs;
    this.gripped = this.lowered + GRIP_MS;
    this.raised = this.gripped + cableMs;
    this.done = this.raised + EXIT_MS;

    // The prize: icons packed in a sunflower spiral, shrunk to fit if there are many.
    const spacing = iconRadius * 1.15;
    this.scale = Math.min(1, PRIZE_MAX_R / (spacing * Math.sqrt(n)));
    this.prizeR = spacing * this.scale * Math.sqrt(n);
    this.slotX = new Float32Array(n);
    this.slotY = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = spacing * this.scale * Math.sqrt(i + 0.5);
      const a = i * 2.39996;
      this.slotX[i] = Math.cos(a) * r;
      this.slotY[i] = Math.sin(a) * r;
    }
    this.fromX = new Float32Array(n);
    this.fromY = new Float32Array(n);
    this.slipped = new Uint8Array(n);
    // The ones to slip are on the outside of the bunch, and go on the way up or soon after.
    for (let k = 0; k < board.dropCount; k++) {
      const i = n - 1 - k;
      const at =
        this.gripped + (this.raised - this.gripped + EXIT_MS * 0.3) * (0.15 + 0.85 * rng());
      this.slips.push({ i, at });
    }
    this.slips.sort((a, b) => a.at - b.at);
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  draw(gfx: Gfx, now: number): void {
    const t = now - this.t0;
    const { board } = this;
    const { width } = board.world;
    const hub = this.hubAt(t);
    const dt = this.frames.dt(t);

    if (!this.taken && t >= this.lowered) {
      this.taken = true;
      board.fx.cutIn({
        name: 'claw',
        color: this.palette.body,
        portrait: clawPortrait(this.palette.body, this.palette.metal),
        shake: 2,
      });
      board.icons.forEach((icon, i) => {
        const at = board.take(i) ?? icon;
        this.fromX[i] = at.x;
        this.fromY[i] = at.y;
      });
      // A shower of sparks off the prongs as they bite.
      for (const side of [-1, 1]) {
        sparkBurst(this.sparks, hub.x + side * 12, hub.y + 18, '#ffffff', 10, {
          speed: 260,
          life: 450,
          size: 6,
        });
      }
    }
    // The bunch's middle, and how far the icons have been drawn into it.
    const prizeX = hub.x;
    const prizeY = hub.y + PRIZE_DROP + this.prizeR;
    const gather = smooth((t - this.lowered) / GRIP_MS);
    const pos = (i: number) => {
      const sx = prizeX + this.slotX[i]!;
      const sy = prizeY + this.slotY[i]!;
      return {
        x: this.fromX[i]! + (sx - this.fromX[i]!) * gather,
        y: this.fromY[i]! + (sy - this.fromY[i]!) * gather,
      };
    };
    while (this.slips.length > 0 && this.slips[0]!.at <= t) {
      const { i } = this.slips.shift()!;
      const at = pos(i);
      this.slipped[i] = 1;
      board.drop(i, at.x, at.y);
      sparkBurst(this.sparks, at.x, at.y, '#ffffff', 6, { speed: 120, life: 500, size: 5 });
    }

    // The gantry with its carriage, a spotlight on the prize and the chain the claw hangs on.
    const fade = Math.max(0, Math.min(1, t / FADE_MS, (this.done - t) / FADE_MS));
    gfx.clawRail(0, width, this.railY, hub.cx, {
      body: this.palette.body,
      rail: this.palette.rail,
      alpha: fade,
    });
    this.drawSpotlight(gfx, hub, t);
    gfx.clawChain(hub.cx, this.railY + 6, hub.x, hub.y - 9, {
      metal: this.palette.metal,
      neon: this.palette.body,
      alpha: fade,
    });

    // The prize glows in an aura of its own.
    if (this.taken && t < this.raised + EXIT_MS) {
      const pulse = 0.85 + 0.15 * Math.sin(t / 150);
      gfx.clawAura(prizeX, prizeY, this.prizeR * 1.15 + 8, {
        color: this.palette.body,
        intensity: pulse * gather,
      });
    }

    if (this.taken) {
      const n = board.icons.length;
      for (let i = 0; i < n; i++) {
        if (this.slipped[i]) continue;
        const at = pos(i);
        board.stamp(at.x, at.y, 1 + (this.scale - 1) * gather);
      }
    }
    // Open on the way down, closing on the icons, then shut on the prize.
    const open = t < this.lowered ? 1 : 1 - smooth((t - this.lowered) / GRIP_MS) * 0.75;
    this.drawClaw(gfx, hub.x, hub.y, hub.sway, open, t);

    // The win: confetti off the carriage as the prize is lifted clear.
    if (!this.won && t >= this.raised) {
      this.won = true;
      const colours = [this.palette.body, '#ffffff', this.palette.metal, '#FDE047', '#F9A8D4'];
      const bang = { speed: 440, life: 2000, size: CONFETTI_SIZE };
      confetti(this.discs, hub.cx, this.railY + CONFETTI_DROP, 36, colours, bang);
      confetti(this.stars, hub.cx, this.railY + CONFETTI_DROP, 36, colours, bang);
    }
    for (const e of [this.sparks, this.discs, this.stars]) {
      e.step(dt);
      e.draw(gfx);
    }
  }

  /** A cone of light from the carriage down to the prize, and a pool of it on the pile. */
  private drawSpotlight(gfx: Gfx, hub: { cx: number; x: number; y: number }, t: number): void {
    if (t < this.entered * 0.5 || t > this.raised + EXIT_MS * 0.4) return;
    const on = Math.min(1, (t - this.entered * 0.5) / 300);
    const bottom = hub.y + 30 + (this.taken ? this.prizeR * 2 : 0);
    const half = 26 + (this.taken ? this.prizeR : 0);
    gfx.clawSpotlight(hub.cx, this.railY + 8, 12, hub.x, bottom, half * 2, {
      color: this.palette.body,
      intensity: 0.9 * on,
    });
    if (t >= this.entered)
      gfx.glow(hub.x, this.gripY + 34, 40, this.palette.body, { intensity: 0.3 * on });
  }

  /**
   * Where the carriage is along the rail (`cx`), and the hub hanging below it at `t`: it
   * trails the carriage a little and sways as the carriage moves.
   */
  private hubAt(t: number): { cx: number; x: number; y: number; sway: number } {
    const { width } = this.board.world;
    let cx: number;
    let y: number;
    let speed = 0;
    if (t < this.entered) {
      const u = smooth(t / this.entered);
      cx = width + 40 + (this.targetX - width - 40) * u;
      y = this.restY;
      speed = -Math.sin(Math.PI * (t / this.entered));
    } else if (t < this.lowered) {
      cx = this.targetX;
      y =
        this.restY +
        (this.gripY - this.restY) * smooth((t - this.entered) / (this.lowered - this.entered));
    } else if (t < this.gripped) {
      cx = this.targetX;
      y = this.gripY;
    } else if (t < this.raised) {
      cx = this.targetX;
      y =
        this.gripY +
        (this.restY - this.gripY) * smooth((t - this.gripped) / (this.raised - this.gripped));
    } else {
      const u = Math.min(1, (t - this.raised) / EXIT_MS);
      cx = this.targetX + (-80 - this.targetX) * smooth(u);
      y = this.restY;
      speed = -Math.sin(Math.PI * u);
    }
    const sway = speed * 0.25;
    return { cx, x: cx - Math.sin(sway) * (y - this.railY) * 0.5, y, sway };
  }

  /** The hub at (x, y), turned by `sway`, with its three prongs `open` from 0 (shut) to 1. */
  private drawClaw(gfx: Gfx, x: number, y: number, sway: number, open: number, t: number): void {
    gfx.push(x, y, sway);
    // The hub's light pulses while it goes down to the pile, and arcs crackle as the prongs bite.
    const lowering = t > this.entered && t < this.lowered;
    const glow = lowering ? 1.5 + 0.5 * Math.sin(t / 80) : 1;
    const biting = t - this.lowered;
    const arc =
      this.taken && t < this.raised
        ? Math.max(1 - biting / (GRIP_MS * 2), 0.12 * (0.5 + 0.5 * Math.sin(t / 37)))
        : 0;
    gfx.clawHead(0, 0, { body: this.palette.body, metal: this.palette.metal, open, arc, glow });
    gfx.pop();
  }
}
