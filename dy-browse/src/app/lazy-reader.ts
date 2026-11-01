import type { BrowseItem, Material } from '../core/types';
import type { ItemReader } from './video-reader';

/** What the lazy reader builds on first use: the reader and how to close what it started. */
export interface BuiltReader {
  reader: ItemReader;
  close(): Promise<void>;
}

/**
 * A reader that starts the speech and OCR workers (the speech models take about half a minute to
 * load) only when the first item needs them, so a run that reads nothing never loads them.
 */
export class LazyItemReader implements ItemReader {
  private built: Promise<BuiltReader> | null = null;

  constructor(private readonly build: () => Promise<BuiltReader>) {}

  async read(item: BrowseItem): Promise<Material | null> {
    this.built ??= this.build();
    return (await this.built).reader.read(item);
  }

  async close(): Promise<void> {
    const built = await this.built?.catch(() => null);
    this.built = null;
    await built?.close();
  }
}
