import { TractorBeam } from '../kit/beam';
import { type Board, pick, type Removal, type Remover } from '../board';
import { Crossing } from '../kit/crossing';
import { type Course, type Craft, type Pose } from '../kit/craft';
import { UFO_SVG } from './art';
import { climbAway } from '../kit/climb-away';
import { type Recolour, SvgArt } from '../kit/svg-art';

const SIZE = 76;
/** The middle of the saucer, in the art's 32×32 view box. */
const CX = 16.3;
const CY = 16.9;
/** The art's saucer is tipped down to the right by this much; turned back, it is level. */
const ART_ANGLE = -0.262;

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
  /** The schemes to pick from for each pass; the first until the first pick. */
  schemes?: readonly Recolour[];
}

/**
 * A flying saucer: wobbles over, bobbing, beaming the icons up into its belly, then zips
 * away without pitching.
 */
export class Ufo implements Craft, Remover {
  readonly name = 'ufo';
  readonly crossMs = 3800;
  /** The beam leaves the middle of its underside. */
  readonly tie = { dx: 0, dy: 9 };
  readonly intake = new TractorBeam();
  private readonly art: SvgArt;
  private readonly schemes: readonly Recolour[];
  private scheme: Recolour;

  constructor({ schemes = UFO_SCHEMES }: Options = {}) {
    this.schemes = schemes;
    this.scheme = schemes[0] ?? {};
    this.art = new SvgArt(UFO_SVG, schemes);
  }

  load(): Promise<void> {
    return this.art.load();
  }

  /** Picks this crossing's colours, then sets off. */
  begin(board: Board, now: number, rng: () => number): Removal {
    this.scheme = pick(this.schemes, rng);
    return new Crossing(this, board, now, rng);
  }

  /** Room for the dome. */
  minY(): number {
    return 30;
  }

  sag(): number {
    return 0;
  }

  pathAt(course: Course, px: number, t: number): Pose {
    const { climb } = climbAway(course, px);
    return { py: course.altitude - climb + Math.sin(t / 260) * 5, tilt: Math.sin(t / 170) * 0.12 };
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt + ART_ANGLE);
    this.art.draw(ctx, this.scheme, { size: SIZE, cx: CX, cy: CY });
    ctx.restore();
  }
}
