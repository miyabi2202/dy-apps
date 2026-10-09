// The tower of icons stacked on the delivery box: where each slot in it is, and how it bends as
// it sways. However many icons a removal carries, the tower keeps to at most `MAX_LAYERS`
// layers of at most `MAX_PER_LAYER` (the rest go into the box first), and shrinks its icons to
// stand within the height it is given, so it reads as an absurd tower at any count. It is laid
// out in the box's frame: x along the box's top, y up from it negative, in world pixels.

/** The most layers it stacks, and the most icons side by side in a layer. */
export const MAX_LAYERS = 24;
export const MAX_PER_LAYER = 3;
/** The most icons it holds: the rest are stuffed into the box. */
export const TOWER_CAP = MAX_LAYERS * MAX_PER_LAYER;
/** How much each layer overlaps the one below, as a share of an icon's height, and the smallest its icons may be drawn. */
const OVERLAP = 0.14;
const MIN_SCALE = 0.35;

/** Where a slot is, in the box's frame, and how it is turned and squashed. */
export interface Placed {
  x: number;
  y: number;
  rotation: number;
  /** Squashed flat by the weight on it: its scale across and up. */
  scaleX: number;
  scaleY: number;
}

/** How the tower stands this frame: how far its top leans (radians, at the top) and a second, quicker whip through its middle. */
export interface Sway {
  lean: number;
  whip: number;
}

/** The slots of a tower of `count` icons, bottom layer first. */
export class Tower {
  /** How many layers it has, how many icons to a layer, and how big its icons are drawn. */
  readonly layers: number;
  readonly perLayer: number;
  readonly scale: number;
  /** How far apart its layers are, and how tall it is with every layer on. */
  readonly layerHeight: number;
  readonly height: number;
  /** Each layer's own skew: how far it is knocked across, and turned. */
  private readonly offset: Float32Array;
  private readonly twist: Float32Array;

  constructor(
    private readonly count: number,
    private readonly iconRadius: number,
    /** The most it may stand, box to top, in world pixels. */
    maxHeight: number,
    rng: () => number,
  ) {
    this.perLayer = Math.max(1, Math.ceil(count / MAX_LAYERS));
    this.layers = Math.max(1, Math.ceil(count / this.perLayer));
    const natural = 2 * iconRadius * (1 - OVERLAP);
    this.scale = Math.min(1, Math.max(MIN_SCALE, maxHeight / (this.layers * natural)));
    this.layerHeight = natural * this.scale;
    this.height = this.layers * this.layerHeight;
    this.offset = new Float32Array(this.layers);
    this.twist = new Float32Array(this.layers);
    for (let l = 0; l < this.layers; l++) {
      // Stacked in a hurry: each layer a little off, and more so the higher it is.
      const wild = 0.5 + l / this.layers;
      this.offset[l] = (rng() - 0.5) * iconRadius * this.scale * 0.6 * wild;
      this.twist[l] = (rng() - 0.5) * 0.3 * wild;
    }
  }

  /** Where slot `k` is with the tower swaying as `sway` says. */
  place(k: number, sway: Sway): Placed {
    const { perLayer, layers, layerHeight, height, scale } = this;
    const layer = Math.floor(k / perLayer);
    const inLayer = layer === layers - 1 ? this.count - perLayer * (layers - 1) : perLayer;
    const across = (k % perLayer) - (inLayer - 1) / 2;
    const up = (layer + 0.5) * layerHeight;
    const f = up / height;
    // It bends like a pole, more the higher up, with a whip through its middle.
    const bend = height * (0.5 * sway.lean * f * f + 0.09 * sway.whip * Math.sin(Math.PI * f));
    const slope = sway.lean * f + 0.09 * sway.whip * Math.PI * Math.cos(Math.PI * f);
    // The bottom layers are squashed by all that is on them.
    const load = layers > 1 ? 1 - layer / (layers - 1) : 0;
    const rotation = slope + this.twist[layer]!;
    const step = 2 * this.iconRadius * scale * 0.9;
    return {
      x: this.offset[layer]! + bend + across * step * Math.cos(rotation),
      y: -up + across * step * Math.sin(rotation),
      rotation,
      scaleX: scale * (1 + 0.1 * load),
      scaleY: scale * (1 - 0.16 * load),
    };
  }
}
