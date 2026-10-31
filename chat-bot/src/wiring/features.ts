import type { Feature } from '../app/feature';
import type { Container } from './container';

/**
 * The features each area registers, in the order they were registered: each is made when the
 * container builds FEATURES, and started and stopped by the app (see app.ts).
 */
export class FeatureRegistry {
  private readonly makers: { name: string; make: (c: Container) => Feature | null }[] = [];

  /** Adds a feature `make` builds from the container; `make` may answer null for one this room doesn't have. */
  add(name: string, make: (c: Container) => Feature | null): this {
    this.makers.push({ name, make });
    return this;
  }

  build(c: Container): Feature[] {
    return this.makers.flatMap(({ make }) => {
      const feature = make(c);
      return feature ? [feature] : [];
    });
  }
}
