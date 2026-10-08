import {
  type Board,
  type CutInRequest,
  type Fx,
  type Gfx,
  pick,
  type Removal,
  type Remover,
  type SpriteSource,
  type World,
} from '../board';
import { Crossing } from '../kit/crossing';
import { type Course, type Craft, type Pose } from '../kit/craft';
import { Vacuum } from '../kit/vacuum';
import { Frames } from '../kit/clock';
import { sparkBurst } from '../kit/fx';
import { Emitter } from '../kit/particles';
import { Wake } from '../kit/trail';
import { easeOut } from '../kit/easing';

/** The car's length, and how far its centre sits above the road. */
const CAR_L = 64;
const CAR_LIFT = 12;
/**
 * The split bridge the car jumps: each half's run, its rise as a share of that, and how far
 * below the left half's top the right half's top is, as a share of the rise, since a car
 * comes down lower than it took off.
 */
const RAMP_RUN_SHARE = 0.28;
const RAMP_RUN_MAX = 150;
const RAMP_RISE_SHARE = 0.5;
const LANDING_DROP_SHARE = 0.6;
/** The bridge fades in and out over this long. */
const FADE_MS = 300;
/** The painted car is this big, its centre at this point of it: room for the wing behind and the wheels below. */
const ART_W = CAR_L + 12;
const ART_H = 32;
const ORIGIN_X = ART_W / 2;
const ORIGIN_Y = 18;

/** The shock of the landing lasts this long, and the car's ghosts follow it this far back. */
const LANDING_MS = 320;
const GHOST_GAP_MS = 55;

/** A car's paint: the body, the trim (its outline and the rear wing), and the neon of its underglow and the bridge's edges (the body's, if none). */
export interface CarPalette {
  body: string;
  trim: string;
  neon?: string;
}

export const CAR_PALETTES: readonly CarPalette[] = [
  // Rosso.
  { body: '#f43f5e', neon: '#fb7185', trim: '#881337' },
  // Papaya orange.
  { body: '#f97316', neon: '#fdba74', trim: '#7c2d12' },
  // Racing yellow.
  { body: '#facc15', neon: '#fde047', trim: '#713f12' },
  // British racing green.
  { body: '#15803d', neon: '#4ade80', trim: '#052e16' },
  // Electric blue.
  { body: '#2563eb', neon: '#38bdf8', trim: '#172554' },
  // Pearl white.
  { body: '#f1f5f9', neon: '#a5f3fc', trim: '#475569' },
  // Violet.
  { body: '#9333ea', neon: '#e879f9', trim: '#3b0764' },
];

interface Options {
  /** The paints to pick from for each crossing; the first until the first pick. */
  palettes?: readonly CarPalette[];
}

/**
 * The split bridge for a canvas this wide: each half's horizontal run and rise, the gap
 * between them, how far below the left half's top the right half's top is, and how high
 * above the left top the jump peaks. The jump is the ballistic arc that leaves the left ramp
 * along its slope, so the car's nose follows through smoothly rather than rearing up, and
 * comes down onto the lower right half: `y(s) = -g·gap·s + (drop + g·gap)·s²` over the gap,
 * for grade `g`.
 */
export function bridge(width: number) {
  const run = Math.min(RAMP_RUN_MAX, width * RAMP_RUN_SHARE);
  const rise = run * RAMP_RISE_SHARE;
  const gap = width - 2 * run;
  const drop = rise * LANDING_DROP_SHARE;
  const launch = (rise / run) * gap;
  return { run, rise, gap, drop, apex: (launch * launch) / (4 * (drop + launch)) };
}

/**
 * A hypercar: two bridge halves appear at the sides like / and \, the right one lower; it
 * runs up the left, jumps the gap in an arc and drives off down the right, nose following
 * the way it is going. The quickest craft, though not so quick you miss it.
 */
export class Hypercar implements Craft, Remover {
  readonly name = 'car';
  readonly crossMs = 3000;
  /** The rope ties on under the car. */
  readonly tie = { dx: 0, dy: CAR_LIFT };
  readonly intake = new Vacuum();
  private readonly palettes: readonly CarPalette[];
  private palette: CarPalette;
  /** Each paint's painted car. */
  private readonly sprites = new Map<CarPalette, SpriteSource>();
  private fx = new CarFx(() => 0.5);
  /** The course of the crossing under way, from the scene, which is drawn first each frame. */
  private course: Course | null = null;

  constructor({ palettes = CAR_PALETTES }: Options = {}) {
    this.palettes = palettes;
    this.palette = palettes[0]!;
  }

  /** Picks this crossing's colours, then sets off. */
  begin(board: Board, now: number, rng: () => number): Removal {
    this.palette = pick(this.palettes, rng);
    this.fx = new CarFx(rng);
    this.course = null;
    return new Crossing(this, board, now, rng);
  }

  /** Room for the jump's peak. */
  minY(world: World): number {
    return bridge(world.width).apex + 24;
  }

  /** It lands this much lower than it took off. */
  sag(world: World): number {
    return bridge(world.width).drop;
  }

  pathAt(course: Course, px: number): Pose {
    const { run, rise, gap, drop } = bridge(course.width);
    const grade = rise / run;
    if (px < run) {
      const s = Math.min(1, Math.max(0, px / run));
      return { py: course.altitude + rise * (1 - s), tilt: px < 0 ? 0 : -Math.atan(grade) };
    }
    const launch = grade * gap;
    if (px <= run + gap) {
      const s = (px - run) / gap;
      const slope = (-launch + 2 * (drop + launch) * s) / gap;
      return { py: course.altitude - launch * s + (drop + launch) * s * s, tilt: Math.atan(slope) };
    }
    // Down the right half, settling from the landing angle onto the ramp's.
    const s = Math.min(1, (px - run - gap) / run);
    const landing = Math.atan((launch + 2 * drop) / gap);
    const settled = Math.min(1, s * 4);
    const tilt = s < 1 ? landing + (Math.atan(grade) - landing) * settled : 0;
    return { py: course.altitude + drop + rise * s, tilt };
  }

  /** As it leaves the ramp for the jump. */
  cutInAt(course: Course): number {
    return bridge(course.width).run;
  }

  cutInRequest(): CutInRequest {
    return { name: this.name, color: '#ef4444', portrait: this.sprite(), hitStopMs: 70, shake: 5 };
  }

  /** The two bridge halves, each a deck with a rail and a torn end at the gap. */
  drawScene(gfx: Gfx, course: Course, t: number, remainingMs: number): void {
    this.course = course;
    const neon = this.palette.neon ?? this.palette.body;
    const { run, rise, drop } = bridge(course.width);
    const alpha = Math.max(0, Math.min(1, t / FADE_MS, remainingMs / FADE_MS));
    for (const side of [-1, 1]) {
      // From the canvas's edge up to the gap; the right half's top is lower.
      const edgeX = side < 0 ? 0 : course.width;
      const gapX = side < 0 ? run : course.width - run;
      const roadY = course.altitude + CAR_LIFT + (side < 0 ? 0 : drop);
      const butt = { alpha, cap: 'butt' } as const;
      // Deck.
      gfx.line(edgeX, roadY + rise, gapX, roadY, 7, '#475569', butt);
      // Neon along the deck's top, and a glow at its end.
      gfx.line(edgeX, roadY + rise - 5, gapX, roadY - 5, 1.5, neon, {
        alpha: 0.6 * alpha,
        blend: 'add',
        cap: 'butt',
      });
      // Road surface and its centre dashes.
      gfx.line(edgeX, roadY + rise - 3, gapX, roadY - 3, 2, '#94a3b8', butt);
      gfx.line(edgeX, roadY + rise - 3, gapX, roadY - 3, 1, '#fde68a', { ...butt, dash: [6, 6] });
      // The torn end of the half at the gap.
      gfx.rect(gapX - 2, roadY - 5, 4, 10, '#ef4444', { alpha });
      // The torn end shorting out: a few sparks a second.
      const flicker = Math.max(0, Math.sin(t / 53 + side * 2) * Math.sin(t / 97));
      gfx.glow(gapX, roadY - 4, 10, '#fde047', { intensity: 1.4 * flicker * alpha });
      // Rail: posts and a top rail along the far side.
      const rail = 'rgba(148, 163, 184, 0.8)';
      for (let i = 0; i <= 4; i++) {
        const x = edgeX + ((gapX - edgeX) * i) / 4;
        const y = roadY + rise * (1 - i / 4) - 3;
        gfx.line(x, y, x, y - 10, 1, rail, butt);
      }
      gfx.line(edgeX, roadY + rise - 13, gapX, roadY - 13, 1, rail, butt);
    }
  }

  /** A low, wedge-shaped car facing right, its wheels on the road `CAR_LIFT` below its centre. */
  draw(gfx: Gfx, x: number, y: number, tilt: number, t: number, fx: Fx): void {
    const { course, palette } = this;
    const neon = palette.neon ?? palette.body;
    const place = {
      x,
      y,
      rotation: tilt,
      anchorX: ORIGIN_X / ART_W,
      anchorY: ORIGIN_Y / ART_H,
    };
    this.fx.draw(gfx, { x, y, tilt, t, neon, course, fx, sprite: this.sprite() });
    gfx.sprite(this.sprite(), { ...place, material: { kind: 'metal', strength: 1 } });
    this.fx.drawLights(gfx, x, y, tilt);
  }

  /** The painted car in this crossing's paint, made once for each. */
  private sprite(): SpriteSource {
    let source = this.sprites.get(this.palette);
    if (!source) {
      const { palette } = this;
      source = {
        key: `car/${palette.body}/${palette.trim}`,
        width: ART_W,
        height: ART_H,
        paint: (ctx) => paintCar(ctx, palette),
      };
      this.sprites.set(palette, source);
    }
    return source;
  }
}

/** The car painted with its centre at (`ORIGIN_X`, `ORIGIN_Y`), facing right. */
function paintCar(ctx: CanvasRenderingContext2D, { body, trim }: CarPalette): void {
  const l = CAR_L;
  ctx.translate(ORIGIN_X, ORIGIN_Y);
  // Body.
  ctx.fillStyle = body;
  ctx.strokeStyle = trim;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-l / 2, 6);
  ctx.lineTo(-l / 2 + 2, -4);
  ctx.lineTo(-l / 4, -5);
  ctx.lineTo(-l / 8, -14);
  ctx.lineTo(l / 6, -14);
  ctx.lineTo(l / 3, -6);
  ctx.lineTo(l / 2 - 2, -2);
  ctx.lineTo(l / 2, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Rear wing.
  ctx.fillStyle = trim;
  ctx.fillRect(-l / 2 - 4, -11, 12, 2.5);
  ctx.fillRect(-l / 2 + 2, -9, 2, 5);
  // Windows.
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(-l / 4 + 3, -5);
  ctx.lineTo(-l / 8 + 2, -12);
  ctx.lineTo(l / 6 - 2, -12);
  ctx.lineTo(l / 3 - 4, -6);
  ctx.closePath();
  ctx.fill();
  // Lights.
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(l / 2 - 7, -2, 6, 2);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-l / 2, -3, 3, 2);
  // Wheels.
  for (const wx of [-l / 3, l / 3]) {
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(wx, CAR_LIFT - 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(wx, CAR_LIFT - 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The car's effects: tyre smoke, nitro, ghosts, taillight trails, and the landing. */
class CarFx {
  private readonly frames = new Frames();
  private readonly smoke: Emitter;
  private readonly sparks: Emitter;
  private readonly flames: Emitter;
  private readonly tails = [new Wake(300), new Wake(300)];
  private readonly ghosts: { x: number; y: number; tilt: number }[] = [];
  private ghostAt = -Infinity;
  private landedAt: { x: number; y: number; t: number } | null = null;

  constructor(private readonly rng: () => number) {
    this.smoke = new Emitter(
      {
        capacity: 120,
        colorFrom: '#cbd5e1',
        blend: 'normal',
        sizeOverLife: (u) => 0.3 + 0.7 * u * 3,
        alphaOverLife: (u) => 0.35 * (1 - u),
      },
      rng,
    );
    this.sparks = new Emitter(
      {
        capacity: 200,
        shape: 'spark',
        colorFrom: '#fde047',
        colorTo: '#ef4444',
        gravity: 900,
        drag: 0.5,
      },
      rng,
    );
    this.flames = new Emitter(
      { capacity: 120, shape: 'spark', colorFrom: '#fff7ed', colorTo: '#f97316' },
      rng,
    );
  }

  draw(
    gfx: Gfx,
    s: {
      x: number;
      y: number;
      tilt: number;
      t: number;
      neon: string;
      course: Course | null;
      fx: Fx;
      sprite: SpriteSource;
    },
  ): void {
    const { rng } = this;
    const { x, y, tilt, t, neon, course } = s;
    const dt = this.frames.dt(t);
    const c = Math.cos(tilt);
    const sn = Math.sin(tilt);
    /** A point of the car, in its own frame, in the world. */
    const at = (lx: number, ly: number) => ({ x: x + lx * c - ly * sn, y: y + lx * sn + ly * c });
    const { run, gap } = course ? bridge(course.width) : { run: 0, gap: 0 };
    const leaping = x >= run && x <= run + gap;
    const onRamp = x > -CAR_L / 2 && x < (course?.width ?? 0) + CAR_L / 2 && !leaping;
    const rear = at(-CAR_L / 2, 0);
    const wheel = at(-CAR_L / 3, CAR_LIFT);

    // Smoke off the rear wheel on the ramps.
    if (onRamp) {
      this.smoke.stream(40, dt, () => ({
        x: wheel.x + (rng() - 0.5) * 4,
        y: wheel.y,
        vx: -30 - 30 * rng(),
        vy: -10 - 20 * rng(),
        life: 600,
        size: 7,
      }));
    }
    // Underglow, on the road beneath it too.
    const under = at(0, CAR_LIFT + 1);
    gfx.ellipse(under.x, under.y, 34, 6, tilt, neon, { alpha: 0.35, blend: 'add' });
    gfx.glow(under.x, under.y, 34, neon, { intensity: 0.35 });

    // Nitro in the jump: flames out of the exhaust, sparks streaming back; aberration about the apex.
    if (leaping) {
      const back = at(-CAR_L / 2 - 2, 1);
      const flick = 0.75 + 0.25 * Math.sin(t / 25);
      gfx.glow(back.x, back.y, 16 * flick, '#f97316', { intensity: 1.4 });
      gfx.glow(back.x - c * 6, back.y - sn * 6, 7 * flick, '#60a5fa', { intensity: 1.4 });
      this.flames.stream(90, dt, () => ({
        x: back.x,
        y: back.y,
        vx: -c * (200 + 150 * rng()) + (rng() - 0.5) * 40,
        vy: -sn * (200 + 150 * rng()) + (rng() - 0.5) * 40,
        life: 280,
        size: 7,
        rotation: tilt,
      }));
      const mid = (x - run) / gap;
      gfx.aberration(0.4 * Math.max(0, 1 - Math.abs(mid - 0.5) / 0.15));
      gfx.speedLines(x, y, { alpha: 0.3 });
      // Ghosts of where it has been.
      if (t - this.ghostAt >= GHOST_GAP_MS) {
        this.ghostAt = t;
        this.ghosts.push({ x, y, tilt });
        if (this.ghosts.length > 4) this.ghosts.shift();
      }
    } else if (this.ghosts.length > 0) {
      this.ghosts.shift();
    }

    // The landing: a shake, a ring through the air, and sparks off the road.
    if (this.landedAt === null && course && x > run + gap && this.sawLeap) {
      this.landedAt = { x, y: y + CAR_LIFT, t };
      s.fx.shake(5, 250);
      s.fx.hitStop(40);
      sparkBurst(this.sparks, x, y + CAR_LIFT, '#fde047', 40, { speed: 380, life: 700, size: 8 });
    }
    if (leaping) this.sawLeap = true;
    if (this.landedAt) {
      const u = (t - this.landedAt.t) / LANDING_MS;
      if (u >= 0 && u < 1) {
        gfx.shockwave(this.landedAt.x, this.landedAt.y, 90 * easeOut(u), 20, 8 * (1 - u));
        gfx.glow(this.landedAt.x, this.landedAt.y, 40, '#fef3c7', { intensity: 1.2 * (1 - u) });
      }
    }

    // Taillight trails.
    this.tails[0]!.add(rear.x, rear.y - 2 * c, t);
    this.tails[1]!.add(rear.x, rear.y + 1, t);
    this.tails.forEach((wake, k) =>
      gfx.ribbon(wake.points(), k === 0 ? 3 : 2, '#ef4444', {
        blend: 'add',
        alphaFrom: 0.8,
        alphaTo: 0,
      }),
    );

    // Ghosts first, so the car draws over them.
    this.ghosts.forEach((g, k) => {
      const alpha = [0.06, 0.12, 0.18, 0.25][k + 4 - this.ghosts.length]!;
      gfx.sprite(s.sprite, {
        x: g.x,
        y: g.y,
        rotation: g.tilt,
        anchorX: ORIGIN_X / ART_W,
        anchorY: ORIGIN_Y / ART_H,
        tint: neon,
        alpha,
        blend: 'add',
      });
    });

    for (const e of [this.smoke, this.flames, this.sparks]) {
      e.step(dt);
      e.draw(gfx);
    }
  }

  private sawLeap = false;

  /** Over the car: the headlight cones and the glow of its lamps. */
  drawLights(gfx: Gfx, x: number, y: number, tilt: number): void {
    gfx.push(x, y, tilt);
    const lamp = { x: CAR_L / 2 - 4, y: -1 };
    gfx.quad(
      [lamp.x, lamp.y - 1, lamp.x, lamp.y + 2, lamp.x + 90, lamp.y + 18, lamp.x + 90, lamp.y - 14],
      [
        'rgba(254, 249, 195, 0.35)',
        'rgba(254, 249, 195, 0.35)',
        'rgba(254, 249, 195, 0)',
        'rgba(254, 249, 195, 0)',
      ],
      { blend: 'add' },
    );
    gfx.glow(lamp.x + 2, lamp.y, 10, '#fef9c3', { intensity: 1.4 });
    gfx.glow(-CAR_L / 2 + 1, -2, 7, '#ef4444', { intensity: 1.2 });
    gfx.pop();
  }
}
