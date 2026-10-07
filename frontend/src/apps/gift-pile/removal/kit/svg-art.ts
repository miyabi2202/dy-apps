import { loadImage } from '../../render/sprite';

/** Swaps for an SVG's fills: each of its own colours (upper-case `#RRGGBB`) to the one to use. */
export type Recolour = Readonly<Record<string, string>>;

/** How big the SVG is rasterised, so it stays sharp when drawn larger than its 32 px. */
const RASTER_PX = 256;

/** The SVG with its fills swapped, as a URL for an image. */
function toUrl(svg: string, recolour: Recolour): string {
  const painted = svg
    .replace(
      /fill="(#[0-9a-f]{6})"/gi,
      (_, c: string) => `fill="${recolour[c.toUpperCase()] ?? c}"`,
    )
    .replace(/width="\d+" height="\d+"/, `width="${RASTER_PX}" height="${RASTER_PX}"`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(painted)}`;
}

/** Where to draw the art: `size` px across, with the point (`cx`, `cy`) of its 32×32 view box at the origin. */
export interface Placement {
  size: number;
  cx: number;
  cy: number;
  /** Flipped left to right about the origin, for art that faces left. */
  mirror?: boolean;
}

/**
 * A craft's look, from an SVG, in each of its colourings. Nothing shows until `load` has
 * turned them into images.
 */
export class SvgArt {
  private readonly images = new Map<Recolour, HTMLImageElement>();

  constructor(
    private readonly svg: string,
    private readonly recolours: readonly Recolour[],
  ) {}

  /** Make an image of every colouring. */
  async load(load: (url: string) => Promise<HTMLImageElement | null> = loadImage): Promise<void> {
    await Promise.all(
      this.recolours.map(async (recolour) => {
        const image = await load(toUrl(this.svg, recolour));
        if (image) this.images.set(recolour, image);
      }),
    );
  }

  /**
   * Draw the art in `recolour` at the origin, placed as `at` says (nothing if it hasn't
   * loaded), and leave `ctx` in the view box's units, for drawing anything that moves on it.
   */
  draw(ctx: CanvasRenderingContext2D, recolour: Recolour, at: Placement): void {
    const k = at.size / 32;
    ctx.scale(at.mirror ? -k : k, k);
    ctx.translate(-at.cx, -at.cy);
    const image = this.images.get(recolour);
    if (image) ctx.drawImage(image, 0, 0, 32, 32);
  }
}
