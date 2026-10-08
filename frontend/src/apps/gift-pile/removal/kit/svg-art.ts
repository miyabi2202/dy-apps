import type { SpriteSource } from '../../render/gfx';
import { loadImage } from '../../render/sprite';

/** A fill to swap a colour for to leave that part of the art out. */
export const NONE = 'none';

/**
 * Swaps for an SVG's fills: each of its own colours (upper-case `#RRGGBB`, or `WHITE`) to the one
 * to use, or `NONE` to leave that part out, so one piece of the art can be drawn alone.
 */
export type Recolour = Readonly<Record<string, string>>;

/** How big the SVG is rasterised, so it stays sharp when drawn larger than its 32 px. */
const RASTER_PX = 256;

/** The SVG with its fills swapped, as a URL for an image. */
function toUrl(svg: string, recolour: Recolour): string {
  const painted = svg
    .replace(
      /fill="(#[0-9a-f]{6}|white)"/gi,
      (_, c: string) => `fill="${recolour[c.toUpperCase()] ?? c}"`,
    )
    .replace(/width="\d+" height="\d+"/, `width="${RASTER_PX}" height="${RASTER_PX}"`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(painted)}`;
}

/** Gives each art's sprites keys of their own, since a texture is cached by its key. */
let nextArt = 0;

/**
 * A craft's look, from an SVG, in each of its colourings. Nothing shows until `load` has
 * turned them into images. Each colouring is a `SpriteSource` 32×32 across, the SVG's view
 * box, for `Gfx.sprite` to draw at any size.
 */
export class SvgArt {
  private readonly sources = new Map<Recolour, SpriteSource>();
  private readonly id = nextArt++;

  constructor(
    private readonly svg: string,
    private readonly recolours: readonly Recolour[],
  ) {
    recolours.forEach((recolour, k) => this.sources.set(recolour, this.source(k)));
  }

  private source(k: number): SpriteSource {
    return { key: `svg/${this.id}/${k}`, width: 32, height: 32, image: null };
  }

  /** Make an image of every colouring. */
  async load(load: (url: string) => Promise<HTMLImageElement | null> = loadImage): Promise<void> {
    await Promise.all(
      this.recolours.map(async (recolour) => {
        const image = await load(toUrl(this.svg, recolour));
        if (image) this.sources.get(recolour)!.image = image;
      }),
    );
  }

  /** The art in `recolour`, to draw with `Gfx.sprite`; it shows nothing if it hasn't loaded. */
  sprite(recolour: Recolour): SpriteSource {
    let source = this.sources.get(recolour);
    if (!source) {
      source = this.source(this.sources.size);
      this.sources.set(recolour, source);
    }
    return source;
  }
}
