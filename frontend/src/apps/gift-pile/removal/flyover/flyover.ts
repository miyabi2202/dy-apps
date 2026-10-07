import type { Scoop } from '../../core/protocol';
import type { Removal, Remover, World } from '../removal';
import type { RemovalSink } from '../sink';
import type { Craft } from './craft';
import { Pass } from './pass';

/** A craft crossing the canvas, taking icons in as it goes (a `Pass`), as a way of removing them. */
export class Flyover implements Remover {
  constructor(readonly craft: Craft) {}

  get name(): string {
    return this.craft.name;
  }

  /** Picks the craft's colours for this pass, then sends it off. */
  begin(sink: RemovalSink, scoop: Scoop, world: World, now: number, rng: () => number): Removal {
    this.craft.repaint?.(rng);
    return new Pass(sink, this.craft, scoop, world, now, rng);
  }
}
