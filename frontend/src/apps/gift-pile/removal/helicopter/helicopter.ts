import { type Board, pick, type Removal, type Remover } from '../board';
import { Crossing } from '../kit/crossing';
import { type Course, type Craft, type Pose } from '../kit/craft';
import { HELICOPTER_SVG } from './art';
import { climbAway } from '../kit/climb-away';
import { type Recolour, SvgArt } from '../kit/svg-art';
import { Vacuum } from '../kit/vacuum';

const SIZE = 76;
/** The middle of the cabin, in the art's 32×32 view box, which faces left. */
const CX = 14;
const CY = 17;
/** Flying forward, a helicopter dips its nose by this much. */
const NOSE_DOWN = 0.1;
/**
 * The rotors, in the art's view box: the main rotor's hub atop the mast and its blades'
 * reach, seen edge on; the tail rotor's hub and its blades' reach, seen face on. The art's
 * own grey for the blades, and how fast each turns, in radians per ms.
 */
const MAIN_HUB = { x: 12.5, y: 7.2 };
const MAIN_REACH = 10;
const TAIL_HUB = { x: 27, y: 12 };
const TAIL_REACH = 3.4;
const BLADE = '#B4ACBC';
const MAIN_SPIN = 0.045;
const TAIL_SPIN = 0.06;

/**
 * Paint schemes, by the art's own fills: the body and skids (`#FF822D`), the tail boom
 * (`#FFB02E`) and the stripe (`#FCD53F`). The art's orange is the first.
 */
export const HELICOPTER_SCHEMES: readonly Recolour[] = [
  {},
  // Police blue and white.
  { '#FF822D': '#2563EB', '#FFB02E': '#3B82F6', '#FCD53F': '#F8FAFC' },
  // Rescue red.
  { '#FF822D': '#DC2626', '#FFB02E': '#EF4444', '#FCD53F': '#FDE68A' },
  // Army green.
  { '#FF822D': '#4D7C0F', '#FFB02E': '#65A30D', '#FCD53F': '#FACC15' },
  // News-chopper white with a red stripe.
  { '#FF822D': '#F1F5F9', '#FFB02E': '#CBD5E1', '#FCD53F': '#EF4444' },
  // Pink.
  { '#FF822D': '#EC4899', '#FFB02E': '#F472B6', '#FCD53F': '#FDF2F8' },
];

interface Options {
  /** The schemes to pick from for each crossing; the first until the first pick. */
  schemes?: readonly Recolour[];
}

/** A helicopter: chugs over nose down with a slow sway, then lifts away still nose down. */
export class Helicopter implements Craft, Remover {
  readonly name = 'helicopter';
  readonly crossMs = 5000;
  /** The rope ties on under the skids. */
  readonly tie = { dx: 2, dy: 27 };
  readonly intake = new Vacuum();
  private readonly art: SvgArt;
  private readonly schemes: readonly Recolour[];
  private scheme: Recolour;

  constructor({ schemes = HELICOPTER_SCHEMES }: Options = {}) {
    this.schemes = schemes;
    this.scheme = schemes[0] ?? {};
    this.art = new SvgArt(HELICOPTER_SVG, schemes);
  }

  load(): Promise<void> {
    return this.art.load();
  }

  /** Picks this crossing's colours, then sets off. */
  begin(board: Board, now: number, rng: () => number): Removal {
    this.scheme = pick(this.schemes, rng);
    return new Crossing(this, board, now, rng);
  }

  /** Room for the rotor. */
  minY(): number {
    return 36;
  }

  sag(): number {
    return 0;
  }

  pathAt(course: Course, px: number, t: number): Pose {
    const { climb } = climbAway(course, px);
    return {
      py: course.altitude - climb + Math.sin(t / 340) * 3,
      tilt: NOSE_DOWN + Math.sin(t / 520) * 0.04,
    };
  }

  /** Mirrored, so it faces the way it flies, with its rotors turning. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, t: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    this.art.draw(ctx, this.scheme, { size: SIZE, cx: CX, cy: CY, mirror: true });
    drawRotors(ctx, t);
    ctx.restore();
  }
}

/**
 * The rotors `t` ms into the crossing, in the art's view box. The main rotor's two blades,
 * seen edge on, sweep out and back as they turn, over the faint disc they blur into; the
 * tail rotor's turn face on.
 */
function drawRotors(ctx: CanvasRenderingContext2D, t: number): void {
  const { x, y } = MAIN_HUB;
  ctx.fillStyle = 'rgba(180, 172, 188, 0.3)';
  ctx.beginPath();
  ctx.roundRect(x - MAIN_REACH, y - 0.5, 2 * MAIN_REACH, 1, 0.5);
  ctx.fill();
  const reach = MAIN_REACH * Math.abs(Math.cos(t * MAIN_SPIN));
  ctx.fillStyle = BLADE;
  ctx.beginPath();
  ctx.roundRect(x - reach, y - 0.9, 2 * reach, 1.8, 0.9);
  ctx.fill();

  ctx.strokeStyle = BLADE;
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const turn of [0, Math.PI / 2]) {
    const a = t * TAIL_SPIN + turn;
    const dx = TAIL_REACH * Math.cos(a);
    const dy = TAIL_REACH * Math.sin(a);
    ctx.moveTo(TAIL_HUB.x - dx, TAIL_HUB.y - dy);
    ctx.lineTo(TAIL_HUB.x + dx, TAIL_HUB.y + dy);
  }
  ctx.stroke();
  ctx.fillStyle = '#E6E6E6';
  ctx.beginPath();
  ctx.arc(TAIL_HUB.x, TAIL_HUB.y, 0.9, 0, Math.PI * 2);
  ctx.fill();
}
