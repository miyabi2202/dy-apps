import { type Board, type Gfx, pick, type Removal, type Remover, type ScoopShape } from '../board';
import { NONE, type Recolour, SvgArt } from '../kit/svg-art';
import { UFO_SVG } from './art';
import { drawBeam } from './beam';
import { easeOut, smooth } from '../kit/easing';
import { clumpOf, clumpSomewhere } from '../kit/clump';
import { Frames } from '../kit/clock';
import { Emitter } from '../kit/particles';
import { Wake } from '../kit/trail';
import { sparkBurst } from '../kit/fx';

// Timing in ms, geometry in world pixels.
const SIZE = 76;
/** The middle of the saucer, in the art's 32×32 view box. */
const CX = 16.3;
const CY = 16.9;
/** The art's saucer is tipped down to the right by this much; turned back, it is level. */
const ART_ANGLE = -0.262;
/** From the saucer's middle down to its belly, where the beam leaves it. */
const BELLY = 9;
/** It hovers with its belly this far above the top of the clump, but no nearer the view's top than this. */
const HOVER_ABOVE = 120;
const HOVER_MIN_Y = 40;
/** It flies in over this long, and the beam takes this long to come on and to go off. */
const ARRIVE_MS = 1200;
const BEAM_ON_MS = 280;
const BEAM_OFF_MS = 240;
/** Icons start up the beam over this long, each taking a while to rise all the way in. */
const STAGGER_MS = 700;
const RISE_MIN_MS = 650;
const RISE_MORE_MS = 350;
/** It waits this long with the beam off, then zips away over this long. */
const PAUSE_MS = 150;
const ESCAPE_MS = 750;
/** How far an icon swings from side to side on its way up, and how small it is on going in. */
const SWIRL = 10;
const IN_SCALE = 0.3;
/** Where the saucer can aim, as fractions of the canvas's width. */
const AIM_FROM = 0.2;
const AIM_TO = 0.8;

/**
 * Colour schemes, by the art's own fills: the saucer's top (`#D3D3D3`) and underside
 * (`#9B9B9B`), the dome (`#26C9FC`) and the lights (`#321B41`). The art's silver is the first.
 */
export const UFO_SCHEMES: readonly Recolour[] = [
  {},
  // Little green men.
  { '#26C9FC': '#4ADE80', '#321B41': '#FDE047' },
  // Gold, with a violet dome.
  { '#D3D3D3': '#FCD34D', '#9B9B9B': '#D97706', '#26C9FC': '#A78BFA' },
  // Silver, with a pink dome and cyan lights.
  { '#26C9FC': '#F472B6', '#321B41': '#22D3EE' },
  // Gunmetal, with a mint dome and yellow lights.
  { '#D3D3D3': '#94A3B8', '#9B9B9B': '#475569', '#26C9FC': '#34D399', '#321B41': '#FDE047' },
  // Purple, with an orchid dome.
  { '#D3D3D3': '#C4B5FD', '#9B9B9B': '#7C3AED', '#26C9FC': '#F0ABFC' },
];

interface Options {
  /** The schemes to pick from for each abduction; the first until the first pick. */
  schemes?: readonly Recolour[];
}

/**
 * A flying saucer: flies in to a clump of the pile and stops over it, beams the icons up
 * into its belly (a few fall back out of the beam on the way), switches the beam off and
 * zips away.
 */
export class Ufo implements Remover {
  readonly name = 'ufo';
  private readonly art: SvgArt;
  /** The dome alone, in each scheme, to draw over the saucer with a sheen. */
  private readonly dome: SvgArt;
  private readonly domes: readonly Recolour[];
  private readonly schemes: readonly Recolour[];

  constructor({ schemes = UFO_SCHEMES }: Options = {}) {
    this.schemes = schemes;
    this.art = new SvgArt(UFO_SVG, schemes);
    this.domes = schemes.map((scheme) => ({
      '#D3D3D3': NONE,
      '#9B9B9B': NONE,
      '#321B41': NONE,
      WHITE: NONE,
      '#26C9FC': scheme['#26C9FC'] ?? '#26C9FC',
    }));
    this.dome = new SvgArt(UFO_SVG, this.domes);
  }

  load(): Promise<void> {
    return Promise.all([this.art.load(), this.dome.load()]).then(() => undefined);
  }

  /** A clump of the pile somewhere across it. */
  shape(rng: () => number): ScoopShape {
    return clumpSomewhere(rng, AIM_FROM, AIM_TO);
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    const scheme = pick(this.schemes, rng);
    const dome = this.domes[this.schemes.indexOf(scheme)]!;
    return new Abduction(board, now, rng, this.art, scheme, this.dome, dome);
  }
}

/** One visit. */
class Abduction implements Removal {
  private readonly t0: number;
  /** Where it hovers, by its middle, and how far down and wide the beam reaches. */
  private readonly hoverX: number;
  private readonly hoverY: number;
  private readonly beamLength: number;
  private readonly beamHalf: number;
  /** When each phase ends, in ms after `t0`. */
  private readonly arrived: number;
  private readonly beamOn: number;
  private readonly beamOff: number;
  private readonly done: number;
  /** When each icon starts up the beam and how long it takes, where it set off from, and where in its swing it starts. */
  private readonly liftAt: Float32Array;
  private readonly liftMs: Float32Array;
  private readonly fromX: Float32Array;
  private readonly fromY: Float32Array;
  private readonly phase: Float32Array;
  /** How far up the beam a dud gets before it falls out (0 for one that goes all the way in). */
  private readonly fallAt: Float32Array;
  /** Which icons have gone in or fallen out. */
  private readonly finished: Uint8Array;
  /** The cut-in has been asked for. */
  private introduced = false;
  private readonly dust: Emitter;
  private readonly sparks: Emitter;
  private readonly rng: () => number;
  private readonly frames = new Frames();
  private readonly wake = new Wake(400);
  /** The saucer's lights, from its scheme or yellow. */
  private lights = '#fde047';

  constructor(
    private readonly board: Board,
    now: number,
    rng: () => number,
    private readonly art: SvgArt,
    private readonly scheme: Recolour,
    private readonly domeArt: SvgArt,
    private readonly dome: Recolour,
  ) {
    const { icons, world, iconRadius } = board;
    const n = icons.length;
    this.dust = new Emitter(
      {
        capacity: 200,
        colorFrom: '#fef9c3',
        sizeOverLife: (u) => 0.6 + 0.6 * u,
        alphaOverLife: (u) => 0.45 * Math.sin(Math.PI * u),
      },
      rng,
    );
    this.sparks = new Emitter(
      { capacity: 80, shape: 'spark', colorFrom: '#ffffff', colorTo: '#fde047', drag: 1 },
      rng,
    );
    this.rng = rng;
    this.lights = scheme['#321B41'] ?? this.lights;
    this.t0 = now;
    const { x: hoverX, top, bottom, spread } = clumpOf(icons, world, 40);
    this.hoverX = hoverX;
    const bellyY = Math.max(board.camera.view.top + HOVER_MIN_Y, top - HOVER_ABOVE);
    this.hoverY = bellyY - BELLY;
    this.beamLength = bottom + iconRadius - bellyY;
    this.beamHalf = Math.min(80, Math.max(26, spread + iconRadius * 1.5));

    this.liftAt = new Float32Array(n);
    this.liftMs = new Float32Array(n);
    this.fromX = new Float32Array(n);
    this.fromY = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.fallAt = new Float32Array(n);
    this.finished = new Uint8Array(n);
    this.arrived = ARRIVE_MS;
    const lifting = this.arrived + BEAM_ON_MS;
    let lastIn = lifting;
    icons.forEach(({ x, y }, i) => {
      // Those nearest the saucer go first.
      const near = (y - top) / Math.max(1, bottom - top);
      this.liftAt[i] = lifting + STAGGER_MS * (0.6 * near + 0.4 * rng());
      this.liftMs[i] = RISE_MIN_MS + RISE_MORE_MS * rng();
      this.fromX[i] = x;
      this.fromY[i] = y;
      this.phase[i] = rng() * Math.PI * 2;
      lastIn = Math.max(lastIn, this.liftAt[i] + this.liftMs[i]);
    });
    // The duds, spread through the stream, each falling out part way up.
    for (let k = 0; k < board.dropCount; k++)
      this.fallAt[Math.floor((k * n) / board.dropCount)] = 0.35 + 0.35 * rng();
    this.beamOn = lastIn;
    this.beamOff = this.beamOn + BEAM_OFF_MS;
    this.done = this.beamOff + PAUSE_MS + ESCAPE_MS;
  }

  isOver(now: number): boolean {
    return now - this.t0 >= this.done;
  }

  draw(gfx: Gfx, now: number): void {
    const t = now - this.t0;
    const { board } = this;
    const dt = this.frames.dt(now);
    const saucer = this.saucerAt(t);
    const bellyX = saucer.x;
    const bellyY = saucer.y + BELLY;
    const leave = this.beamOff + PAUSE_MS;
    this.wake.add(saucer.x, saucer.y, t);

    // As it stops over the clump, the cut-in, and the flash of its arrival.
    if (!this.introduced && t >= this.arrived) {
      this.introduced = true;
      board.fx.cutIn({
        name: 'ufo',
        color: '#fde047',
        portrait: this.art.sprite(this.scheme),
        hitStopMs: 80,
      });
    }
    if (t >= this.arrived) {
      const since = t - this.arrived;
      if (since < 150) gfx.flash('#e0f2fe', 0.25 * (1 - since / 150));
      if (since < 300) gfx.aberration(0.6 * (1 - since / 300));
      if (since < 400) {
        const u = since / 400;
        gfx.shockwave(saucer.x, saucer.y, 120 * easeOut(u), 24, 10 * (1 - u));
      }
    }

    // The beam: coming on, on, then going off.
    const strength =
      t < this.arrived
        ? 0
        : t < this.beamOn
          ? smooth((t - this.arrived) / BEAM_ON_MS)
          : 1 - smooth((t - this.beamOn) / BEAM_OFF_MS);
    const reach = t < this.arrived + BEAM_ON_MS ? smooth((t - this.arrived) / BEAM_ON_MS) : 1;
    drawBeam(
      gfx,
      bellyX,
      bellyY,
      { length: this.beamLength * reach, bottomHalf: this.beamHalf, strength },
      t,
    );
    // Dust drifting up the beam from the pile.
    if (strength > 0.2) {
      const bottom = bellyY + this.beamLength;
      this.dust.stream(40 * strength, dt, () => ({
        x: bellyX + (this.rng() - 0.5) * this.beamHalf * 1.6,
        y: bottom - this.rng() * 8,
        vx: (this.rng() - 0.5) * 12,
        vy: -(30 + 40 * this.rng()),
        life: 1100,
        size: 7,
      }));
    }

    // The icons on their way up: drawn over the beam, under the saucer they go into.
    const n = board.icons.length;
    for (let i = 0; i < n; i++) {
      if (this.finished[i] || t < this.liftAt[i]!) continue;
      const at = board.take(i);
      if (at) {
        this.fromX[i] = at.x;
        this.fromY[i] = at.y;
      }
      const u = Math.min(1, (t - this.liftAt[i]!) / this.liftMs[i]!);
      // Slow off the pile, then ever faster up into the belly.
      const e = u * u;
      const swing = Math.sin(u * Math.PI * 2.5 + this.phase[i]!) * SWIRL * (1 - u);
      const x = this.fromX[i]! + (bellyX - this.fromX[i]!) * e + swing;
      const y = this.fromY[i]! + (bellyY - this.fromY[i]!) * e;
      const fall = this.fallAt[i]!;
      if (fall > 0 && u >= fall) {
        this.finished[i] = 1;
        board.drop(i, x, y);
        continue;
      }
      if (u >= 1) {
        this.finished[i] = 1;
        // Gone into the belly in a spark.
        sparkBurst(this.sparks, bellyX, bellyY, this.lights, 3, { speed: 140, life: 300, size: 5 });
        continue;
      }
      // Lit gold by the beam, brighter the nearer the saucer.
      gfx.glow(x, y, board.iconRadius * 2, '#fde047', { intensity: 0.12 + 0.3 * u });
      board.stamp(x, y, 1 - (1 - IN_SCALE) * Math.max(0, (u - 0.5) / 0.5));
    }
    this.dust.step(dt);
    this.dust.draw(gfx);
    this.sparks.step(dt);
    this.sparks.draw(gfx);

    // Zipping away: a streak behind it, speed lines, and a kick as it goes.
    if (t >= leave) {
      const u = Math.min(1, (t - leave) / ESCAPE_MS);
      gfx.ribbon(this.wake.points(), (v) => 30 * (1 - v), this.lights, {
        blend: 'add',
        alphaFrom: 0.8,
        alphaTo: 0,
      });
      if (t - leave > ESCAPE_MS - 400) gfx.speedLines(saucer.x, saucer.y, { alpha: 0.35 });
      const since = t - leave;
      if (since < 300) {
        gfx.shockwave(saucer.x, saucer.y, 90 * easeOut(since / 300), 20, 8 * (1 - since / 300));
        gfx.glow(saucer.x, saucer.y, 60, '#ffffff', { intensity: 1.4 * (1 - since / 300) });
      }
      if (u > 0.9) gfx.aberration(0.3);
    }

    this.drawSaucer(gfx, saucer, t);
  }

  /** The saucer: metal, with a holographic dome and lights circling its rim. */
  private drawSaucer(gfx: Gfx, saucer: { x: number; y: number; tilt: number }, t: number): void {
    const place = {
      x: saucer.x,
      y: saucer.y,
      width: SIZE,
      height: SIZE,
      anchorX: CX / 32,
      anchorY: CY / 32,
      rotation: saucer.tilt + ART_ANGLE,
    };
    gfx.glow(saucer.x, saucer.y + 2, 46, this.lights, { intensity: 0.28 });
    gfx.sprite(this.art.sprite(this.scheme), {
      ...place,
      material: { kind: 'metal', strength: 0.8 },
    });
    gfx.sprite(this.domeArt.sprite(this.dome), {
      ...place,
      alpha: 0.9,
      material: { kind: 'holo', strength: 0.9 },
    });
    // Lights chasing round its rim.
    const rim = 25;
    for (let k = 0; k < 6; k++) {
      const a = t / 700 + (k * Math.PI * 2) / 6;
      // Only the front half is seen in front; the back half is hidden by the dome's glow, so dim.
      const front = Math.sin(a) > 0;
      const px = Math.cos(a) * rim;
      const py = 4 + Math.sin(a) * 4;
      const c = Math.cos(saucer.tilt);
      const sn = Math.sin(saucer.tilt);
      gfx.glow(saucer.x + px * c - py * sn, saucer.y + px * sn + py * c, 7, this.lights, {
        intensity: front ? 1.4 : 0.5,
      });
    }
  }

  /** Where the saucer's middle is at `t`, and how it is tipped. */
  private saucerAt(t: number): { x: number; y: number; tilt: number } {
    const { width } = this.board.world;
    const bob = Math.sin(t / 300) * 3;
    if (t < this.arrived) {
      // In from above the top left, slowing to a stop over the clump, leaning into it.
      const u = t / this.arrived;
      const e = easeOut(u);
      const from = this.board.camera.view.top - 50;
      const x = -60 + (this.hoverX + 60) * e;
      const y = from + (this.hoverY - from) * e + Math.sin(u * Math.PI) * -30;
      return { x, y: y + bob * e, tilt: 0.25 * (1 - e) };
    }
    const leave = this.beamOff + PAUSE_MS;
    if (t < leave) {
      return { x: this.hoverX, y: this.hoverY + bob, tilt: Math.sin(t / 200) * 0.05 };
    }
    // Off and away to the top right, ever faster.
    const u = Math.min(1, (t - leave) / ESCAPE_MS);
    const e = u * u * u;
    return {
      x: this.hoverX + (width + 90 - this.hoverX) * e,
      y: this.hoverY + bob + (this.board.camera.view.top - 70 - this.hoverY) * e,
      tilt: -0.3 * Math.min(1, u * 3),
    };
  }
}
